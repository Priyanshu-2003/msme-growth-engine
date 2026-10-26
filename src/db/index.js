// src/db/index.js - SQLite database manager for BharatGrowth AI
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const { SCHEMA_SQL } = require('./schema.js');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/msme.sqlite');

let dbInstance = null;

function getDb() {
  if (dbInstance) return dbInstance;
  
  // Ensure data directory exists
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  dbInstance = new DatabaseSync(DB_PATH);
  initDb(dbInstance);
  return dbInstance;
}

function initDb(db) {
  // Execute schema
  db.exec(SCHEMA_SQL);
  
  // Migration: Ensure new columns exist in leads table
  try {
    const tableInfo = db.prepare("PRAGMA table_info(leads)").all();
    const columnNames = new Set(tableInfo.map(c => c.name));
    if (!columnNames.has('inventory_profile')) {
      db.exec("ALTER TABLE leads ADD COLUMN inventory_profile TEXT DEFAULT '{}'");
    }
    if (!columnNames.has('buying_signal')) {
      db.exec("ALTER TABLE leads ADD COLUMN buying_signal TEXT");
    }
    if (!columnNames.has('maps_rating')) {
      db.exec("ALTER TABLE leads ADD COLUMN maps_rating REAL");
    }
    if (!columnNames.has('reviews_count')) {
      db.exec("ALTER TABLE leads ADD COLUMN reviews_count INTEGER DEFAULT 0");
    }
    if (!columnNames.has('is_demo')) {
      db.exec("ALTER TABLE leads ADD COLUMN is_demo INTEGER DEFAULT 0");
    }
    if (!columnNames.has('live_url')) {
      db.exec("ALTER TABLE leads ADD COLUMN live_url TEXT");
    }
    db.exec("CREATE INDEX IF NOT EXISTS idx_leads_is_demo ON leads(is_demo)");
    // Tag existing demo/seed leads
    db.exec("UPDATE leads SET is_demo = 1 WHERE source_name != 'Sprint Deliverable File' AND (is_demo IS NULL OR is_demo = 0)");
  } catch (err) {
    console.error("Migration check:", err.message);
  }

  // Backfill activity_logs from existing audit_history if empty
  try {
    const actCount = db.prepare("SELECT COUNT(*) as c FROM activity_logs").get().c;
    if (actCount === 0) {
      const leadsWithAudits = db.prepare("SELECT id, audit_history FROM leads WHERE audit_history != '[]' AND audit_history IS NOT NULL").all();
      const insertAct = db.prepare(`
        INSERT INTO activity_logs (id, user, action_type, lead_id, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const l of leadsWithAudits) {
        try {
          const audits = JSON.parse(l.audit_history || '[]');
          for (let i = 0; i < audits.length; i++) {
            const a = audits[i];
            const logId = `act_bf_${l.id}_${i}_${Math.random().toString(36).substring(2, 6)}`;
            insertAct.run(
              logId,
              a.author || 'System',
              a.action || 'STAGE_CHANGED',
              l.id,
              JSON.stringify({ details: a.details, note: a.note, backfilled: true }),
              a.timestamp || new Date().toISOString()
            );
          }
        } catch (e) {}
      }
    }
  } catch (err) {
    console.error("Activity logs backfill check:", err.message);
  }

  // Seed default scripts if scripts table is empty
  try {
    const scriptsCount = db.prepare("SELECT COUNT(*) as count FROM scripts").get().count;
    if (scriptsCount === 0) {
      const now = new Date().toISOString();
      const insertScript = db.prepare(`
        INSERT INTO scripts (id, script_key, channel, language, title, content, version, created_at, created_by)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, 'System')
      `);

      const defaultScripts = [
        {
          key: 'cold_call_en',
          channel: 'CALL',
          lang: 'EN',
          title: 'Cold Call Script (English) - 20s Hook & WhatsApp Consent',
          content: `1. Introduction: "Namaste! Am I speaking with the proprietor or managing director of {{business_name}}?"\n2. Context: "I am calling from BharatGrowth. We work with MSME manufacturers and suppliers across {{city}}."\n3. Observation: "We noticed your business, but observed that buyers cannot easily find a mobile-friendly product catalogue for your {{subcategory}} online."\n4. Value Hook: "We help MSMEs set up a professional mobile B2B catalogue with a direct WhatsApp enquiry button and Google Business Profile setup so buyers can enquire instantly."\n5. Founding Offer & Consent: "We are offering a founding client special of ₹5,999 (₹2,000 advance) for 3 businesses who give a testimonial. May I send a 1-page WhatsApp audit report of your online presence to this number for you to review?"`
        },
        {
          key: 'cold_call_hi',
          channel: 'CALL',
          lang: 'HI',
          title: 'Cold Call Script (Hindi) - 20s Hook & WhatsApp Consent',
          content: `1. परिचय: "नमस्ते जी, क्या मेरी बात {{business_name}} के प्रोपराइटर या संचालक से हो रही है?"\n2. संदर्भ: "मैं भारतग्रोथ से बात कर रहा हूँ। हम {{city}} में MSME निर्माताओं के साथ काम करते हैं।"\n3. मुख्य समस्या: "हमने देखा कि {{city}} में आपका बढ़िया कारोबार है, लेकिन ऑनलाइन खरीदारों के लिए मोबाइल पर आपका प्रोडक्ट कैटलॉग और सीधा व्हाट्सएप बटन उपलब्ध नहीं है।"\n4. समाधान: "हम आपके लिए एक आसान मोबाइल B2B कैटलॉग बनाते हैं, जिससे व्यापारी सीधे आपके फोन पर व्हाट्सएप इन्क्वायरी भेज सकते हैं, साथ में गूगल बिज़नेस प्रोफ़ाइल भी सेटअप करते हैं।"\n5. फाउंडिंग ऑफर और सहमति: "पहले 3 फाउंडिंग क्लाइंट्स के लिए हमारा ऑफर ₹5,999 है (₹2,000 एडवांस)। क्या मैं आपके इसी व्हाट्सएप नंबर पर 1-पेज की ऑडिट रिपोर्ट भेज दूँ ताकि आप इसे देख सकें?"`
        },
        {
          key: 'whatsapp_audit_en',
          channel: 'WHATSAPP',
          lang: 'EN',
          title: 'WhatsApp Post-Call Audit Pitch (English)',
          content: `Namaste! As discussed during our call regarding {{business_name}} in {{city}}:\n\nHere is your 1-page Online Presence & Catalogue Audit Report.\n\nKey Deliverables:\n1. Mobile-friendly B2B Product Catalogue (tested on 4G phones)\n2. Direct WhatsApp Enquiry Button (buyers tap to message your phone directly)\n3. Google Business Profile Setup (so local & outstation buyers discover you)\n\nPricing:\n• Standard List Price: ₹7,999\n• Founding Client Special: ₹5,999 (for first 3 clients with testimonial)\n• Terms: ₹2,000 UPI advance to begin, balance on delivery.\n\nWould you like me to share a 1-minute live demo link customized for your products?`
        },
        {
          key: 'whatsapp_audit_hi',
          channel: 'WHATSAPP',
          lang: 'HI',
          title: 'WhatsApp Post-Call Audit Pitch (Hindi)',
          content: `नमस्ते! जैसा कि हमने फोन पर चर्चा की थी, यह संदेश {{business_name}} ({{city}}) के लिए है:\n\nहम MSME उद्यमों के लिए "B2B कैटलॉग + व्हाट्सएप इन्क्वायरी + गूगल बिज़नेस प्रोफ़ाइल" तैयार करते हैं ताकि बाहर के व्यापारी सीधे आपके व्हाट्सएप पर ऑर्डर भेज सकें।\n\nपैकेज और फीस:\n• लिस्ट प्राइस: ₹7,999\n• फाउंडिंग क्लाइंट ऑफर: ₹5,999 (पहले 3 क्लाइंट्स के लिए टेस्टिमोनियल के साथ)\n• शर्तें: ₹2,000 UPI एडवांस, बाकी कैटलॉग लाइव होने पर।\n\nक्या मैं आपको आपके सेक्टर का 1-मिनट का लाइव डेमो लिंक भेज दूँ?`
        }
      ];

      for (const s of defaultScripts) {
        insertScript.run(`scr_${s.key}_v1`, s.key, s.channel, s.lang, s.title, s.content, now);
      }
    }
  } catch (err) {
    console.error("Scripts seed check:", err.message);
  }

  // Ensure Mantis AI source is registered
  try {
    const hasMantis = db.prepare("SELECT COUNT(*) as count FROM sources WHERE id = 'src_mantis_ai'").get().count;
    if (hasMantis === 0) {
      db.prepare(`
        INSERT INTO sources (
          id, name, access_method, usage_restrictions, available_fields,
          freshness, coverage_limitations, cost_per_query, rate_limit_per_min,
          commercial_reuse_allowed, is_active, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'src_mantis_ai',
        'Mantis AI Local Lead Intelligence (mantisai.in)',
        'Map-First Live Scanning & Website Gap Detection',
        'Proprietary B2B Lead Intelligence; commercial prospecting permitted for subscribers.',
        'Business Name, Phone, Google Maps Rating, Reviews, Website Status, Address, Buying Signals',
        'Real-time live map scanning',
        'Specialized in Indian local businesses, factories, and MSMEs with weak or missing websites',
        0.0,
        120,
        1,
        1,
        new Date().toISOString()
      );
    }
  } catch (err) {
    // Ignore if table not yet created
  }
  
  // Seed default sources if empty
  const count = db.prepare('SELECT COUNT(*) as count FROM sources').get().count;
  if (count === 0) {
    const seedSources = [
      {
        id: 'src_osm_india',
        name: 'OpenStreetMap India Business Registry',
        access_method: 'Overpass API (REST / JSON)',
        usage_restrictions: 'Open Data Commons ODbL; attribution required; public commercial reuse permitted.',
        available_fields: 'Name, Category, Coordinates, Address, City, State, Phone, Website, Tags',
        freshness: 'Continuous community updates (Daily)',
        coverage_limitations: 'Strong in industrial clusters, tier-1/tier-2 urban hubs; sparse in remote rural areas',
        cost_per_query: 0.0,
        rate_limit_per_min: 120,
        commercial_reuse_allowed: 1,
        is_active: 1
      },
      {
        id: 'src_datagov_in',
        name: 'data.gov.in Open MSME Records',
        access_method: 'OGD India REST API & Public CSV dumps',
        usage_restrictions: 'Government Open Data License - India (GODL); free commercial reuse with attribution.',
        available_fields: 'Enterprise Name, State, District, Broad Industry, NIC Code, Investment Tier',
        freshness: 'Periodic government releases (Quarterly/Annual)',
        coverage_limitations: 'High-level aggregated or sample MSME registries; direct phone/email often redacted for privacy',
        cost_per_query: 0.0,
        rate_limit_per_min: 60,
        commercial_reuse_allowed: 1,
        is_active: 1
      },
      {
        id: 'src_user_csv',
        name: 'User-Provided Lead File (CSV / Excel)',
        access_method: 'Direct File Upload & Streaming Parser',
        usage_restrictions: 'User retains sole ownership; must certify lawful collection under DPDP Act 2023.',
        available_fields: 'Customizable: Name, Phone, Email, City, State, Website, Category, PIN code',
        freshness: 'User defined',
        coverage_limitations: 'Dependent on user-supplied data quality',
        cost_per_query: 0.0,
        rate_limit_per_min: 1000,
        commercial_reuse_allowed: 1,
        is_active: 1
      },
      {
        id: 'src_google_places',
        name: 'Google Maps Platform (Places API)',
        access_method: 'Places API (Text Search & Details)',
        usage_restrictions: 'Google Maps Platform Terms of Service. Caching restrictions apply; no bulk scraping or permanent reselling.',
        available_fields: 'Place Name, Address, Formatted Phone, Website URL, Rating, User Ratings Total, Operating Status',
        freshness: 'Real-time',
        coverage_limitations: 'High coverage nationwide; requires Google Cloud Billing and API Key',
        cost_per_query: 2.65, // Approx INR per Text Search query
        rate_limit_per_min: 600,
        commercial_reuse_allowed: 0, // Restricted permanent storage by ToS
        is_active: 0 // Inactive until API key configured
      },
      {
        id: 'src_indiamart_registry',
        name: 'IndiaMART Directory Reference',
        access_method: 'Licensed B2B Marketplace API / Partner Feed',
        usage_restrictions: 'Proprietary Terms. Automated scraping without written permission strictly prohibited; partner API required.',
        available_fields: 'Company Name, Products, Primary City, Verified Badge',
        freshness: 'Live directory',
        coverage_limitations: 'Restricted without enterprise API contract',
        cost_per_query: 5.0,
        rate_limit_per_min: 30,
        commercial_reuse_allowed: 0,
        is_active: 0
      }
    ];

    const stmt = db.prepare(`
      INSERT INTO sources (
        id, name, access_method, usage_restrictions, available_fields,
        freshness, coverage_limitations, cost_per_query, rate_limit_per_min,
        commercial_reuse_allowed, is_active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();
    for (const s of seedSources) {
      stmt.run(
        s.id, s.name, s.access_method, s.usage_restrictions, s.available_fields,
        s.freshness, s.coverage_limitations, s.cost_per_query, s.rate_limit_per_min,
        s.commercial_reuse_allowed, s.is_active, now
      );
    }
  }

  // Seed default settings if empty
  const settingsCount = db.prepare('SELECT COUNT(*) as count FROM settings').get().count;
  if (settingsCount === 0) {
    const defaultSettings = [
      { key: 'weight_digital_need', value: JSON.stringify(30) },
      { key: 'weight_commercial_fit', value: JSON.stringify(25) },
      { key: 'weight_contactability', value: JSON.stringify(20) },
      { key: 'weight_evidence_freshness', value: JSON.stringify(15) },
      { key: 'weight_geo_fit', value: JSON.stringify(10) },
      { key: 'daily_budget_inr', value: JSON.stringify(500) },
      { key: 'max_records_per_run', value: JSON.stringify(250) },
      { key: 'auto_approve_threshold', value: JSON.stringify(85) },
      { key: 'telecom_dnd_compliance', value: JSON.stringify(true) }
    ];

    const stmt = db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)');
    const now = new Date().toISOString();
    for (const item of defaultSettings) {
      stmt.run(item.key, item.value, now);
    }
  }

  // Seed sample catalogue if empty
  try {
    const catCount = db.prepare('SELECT COUNT(*) as count FROM catalogues').get().count;
    if (catCount === 0) {
      const sampleProducts = [
        {
          id: 'p1',
          name: 'Poly-Georgette Digital Printed Saree Fabric',
          spec: 'GSM: 65 | Width: 44 inches | Export Grade',
          moq: '500 Metres',
          price: '₹65 / Metre',
          image_url: '',
          alt_text: 'Rolls of printed poly-georgette fabric'
        },
        {
          id: 'p2',
          name: 'Brocade & Jacquard Blouse Material',
          spec: 'GSM: 140 | Zari Weave | 48 inch width',
          moq: '300 Metres',
          price: '₹125 / Metre',
          image_url: '',
          alt_text: 'Golden woven jacquard textile sample'
        },
        {
          id: 'p3',
          name: 'Heavy Rayon Slub 14kg Quality',
          spec: '100% Viscose | 140 GSM | Plain Dyed',
          moq: '1,000 Metres',
          price: '₹78 / Metre',
          image_url: '',
          alt_text: 'Dyed rayon fabric swatches'
        }
      ];

      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO catalogues (
          id, lead_id, token, business_name, tagline, language,
          whatsapp_number, phone, email, address, google_maps_url,
          products, verified_badges, meta_description, is_sample,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'cat_sample_surat_weaving',
        null,
        'cat_demo_sample_001',
        'Surat Jacquard & Synthetic Textiles (Sample)',
        'B2B Wholesale Fabric Manufacturer & Exporter',
        'EN',
        '91XXXXXXXXXX',
        '91XXXXXXXXXX',
        'sales@example.com',
        'Ring Road Textile Market, Surat, Gujarat 395002',
        'https://maps.google.com/?q=Surat+Textile+Market',
        JSON.stringify(sampleProducts),
        JSON.stringify(['Client-Verified GST Registered', 'Factory Premises Verified']),
        'B2B Wholesale Fabric Manufacturer & Exporter in Surat, Gujarat. Enquire directly on WhatsApp.',
        1,
        now,
        now
      );
    }
  } catch (err) {
    // Ignore if catalogues table doesn't exist yet
  }
}

function closeDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

module.exports = {
  getDb,
  closeDb,
  DB_PATH
};
