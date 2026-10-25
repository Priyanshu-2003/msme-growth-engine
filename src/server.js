// src/server.js - High-performance Node.js HTTP Server & REST API for BharatGrowth AI
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const { getDb } = require('./db/index.js');
const { parseCsvContent } = require('./sources/csv_adapter.js');
const { processCandidateLead, runBatchDiscoveryJob, getSettingsMap } = require('./core/operations_manager.js');
const { INDIAN_STATES_AND_UTS, MSME_CATEGORIES } = require('./core/taxonomy.js');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '../public');

// MIME types for static assets
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 10 * 1024 * 1024) { // 10MB limit
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error(`Invalid JSON: ${err.message}`));
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  const db = getDb();

  try {
    // -------------------------------------------------------------
    // REST API ROUTES
    // -------------------------------------------------------------

    // 1. Executive Dashboard API
    if (method === 'GET' && pathname === '/api/dashboard') {
      const totalLeads = db.prepare('SELECT COUNT(*) as c FROM leads').get().c;
      const verifiedLeads = db.prepare("SELECT COUNT(*) as c FROM leads WHERE verification_status = 'VERIFIED_ACTIVE'").get().c;
      const qualifiedLeads = db.prepare("SELECT COUNT(*) as c FROM leads WHERE pipeline_stage != 'DISCOVERED' AND lead_score >= 50").get().c;
      const noWebsiteLeads = db.prepare("SELECT COUNT(*) as c FROM leads WHERE website_status = 'NO_WEBSITE_FOUND'").get().c;
      const highPriorityLeads = db.prepare("SELECT COUNT(*) as c FROM leads WHERE opportunity_tier = 'TIER_1_HIGH'").get().c;

      // Pipeline funnel counts
      const pipelineStages = [
        'DISCOVERED', 'RESEARCHED', 'QUALIFIED', 'APPROVED_FOR_CONTACT',
        'CONTACTED', 'REPLIED', 'MEETING_BOOKED', 'PROPOSAL_SENT', 'WON', 'LOST', 'NURTURE'
      ];
      const funnel = {};
      for (const st of pipelineStages) {
        funnel[st] = db.prepare('SELECT COUNT(*) as c FROM leads WHERE pipeline_stage = ?').get(st).c;
      }

      // Breakdown by Industry Category
      const industryBreakdown = db.prepare(`
        SELECT industry_category, COUNT(*) as count, AVG(lead_score) as avg_score
        FROM leads
        GROUP BY industry_category
        ORDER BY count DESC
      `).all();

      // Breakdown by State
      const stateBreakdown = db.prepare(`
        SELECT state, COUNT(*) as count, SUM(CASE WHEN website_status = 'NO_WEBSITE_FOUND' THEN 1 ELSE 0 END) as no_website_count
        FROM leads
        GROUP BY state
        ORDER BY count DESC
        LIMIT 10
      `).all();

      // Recent leads (last 7 days)
      const recentLeads = db.prepare(`
        SELECT id, business_name, city, state, industry_category, website_status, lead_score, opportunity_tier, pipeline_stage, discovery_date
        FROM leads
        ORDER BY discovery_date DESC
        LIMIT 8
      `).all();

      // Operating Cost & Source Tracking
      const totalQueries = db.prepare('SELECT SUM(total_found) as c FROM discovery_jobs').get().c || 0;
      const totalSpendInr = db.prepare('SELECT SUM(cost_per_query * 0) as spend FROM sources').get().spend || 0.0;

      return sendJson(res, 200, {
        kpis: {
          totalLeads,
          verifiedLeads,
          qualifiedLeads,
          noWebsiteLeads,
          highPriorityLeads,
          conversionRate: totalLeads > 0 ? ((funnel['WON'] / totalLeads) * 100).toFixed(1) : 0,
          costPerQualifiedLead: qualifiedLeads > 0 ? (totalSpendInr / qualifiedLeads).toFixed(2) : 0
        },
        funnel,
        industryBreakdown,
        stateBreakdown,
        recentLeads,
        operatingCost: {
          totalSpendInr,
          totalQueries,
          freeOpenDataQueries: totalQueries,
          budgetCapInr: 500
        }
      });
    }

    // 2. Lead Explorer API (Faceted search, filter, pagination)
    if (method === 'GET' && pathname === '/api/leads') {
      const q = parsedUrl.query;
      const search = (q.search || '').trim().toLowerCase();
      const state = q.state || '';
      const industry = q.industry || '';
      const websiteStatus = q.website_status || '';
      const opportunityTier = q.opportunity_tier || '';
      const verificationStatus = q.verification_status || '';
      const pipelineStage = q.pipeline_stage || '';
      const page = Math.max(1, parseInt(q.page || '1', 10));
      const limit = Math.max(1, Math.min(100, parseInt(q.limit || '20', 10)));
      const offset = (page - 1) * limit;

      let whereClauses = ['1=1'];
      const params = [];

      if (search) {
        whereClauses.push('(LOWER(business_name) LIKE ? OR LOWER(city) LIKE ? OR normalized_phone LIKE ?)');
        const wild = `%${search}%`;
        params.push(wild, wild, wild);
      }
      if (state) {
        whereClauses.push('state = ?');
        params.push(state);
      }
      if (industry) {
        whereClauses.push('industry_category = ?');
        params.push(industry);
      }
      if (websiteStatus) {
        whereClauses.push('website_status = ?');
        params.push(websiteStatus);
      }
      if (opportunityTier) {
        whereClauses.push('opportunity_tier = ?');
        params.push(opportunityTier);
      }
      if (verificationStatus) {
        whereClauses.push('verification_status = ?');
        params.push(verificationStatus);
      }
      if (pipelineStage) {
        whereClauses.push('pipeline_stage = ?');
        params.push(pipelineStage);
      }

      const whereSql = whereClauses.join(' AND ');
      const totalCount = db.prepare(`SELECT COUNT(*) as c FROM leads WHERE ${whereSql}`).get(...params).c;

      const leads = db.prepare(`
        SELECT id, business_name, industry_category, subcategory, entity_type, msme_tier,
               state, district, city, pincode, phone, email, website, source_name,
               website_status, opportunity_tier, lead_score, verification_status,
               pipeline_stage, assigned_owner, next_action, discovery_date
        FROM leads
        WHERE ${whereSql}
        ORDER BY lead_score DESC, discovery_date DESC
        LIMIT ? OFFSET ?
      `).all(...params, limit, offset);

      return sendJson(res, 200, {
        totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
        leads
      });
    }

    // 3. Lead Details API
    if (method === 'GET' && pathname.startsWith('/api/leads/') && !pathname.includes('export') && !pathname.includes('preview-portal')) {
      const id = pathname.replace('/api/leads/', '');
      const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(id);

      if (!lead) {
        return sendJson(res, 404, { error: 'Lead not found' });
      }

      // Parse JSON fields
      lead.digital_assessment = JSON.parse(lead.digital_assessment || '{}');
      lead.evidence = JSON.parse(lead.evidence || '[]');
      lead.services_needed = JSON.parse(lead.services_needed || '[]');
      lead.score_breakdown = JSON.parse(lead.score_breakdown || '{}');
      lead.social_profiles = JSON.parse(lead.social_profiles || '[]');
      lead.notes = JSON.parse(lead.notes || '[]');
      lead.audit_history = JSON.parse(lead.audit_history || '[]');
      lead.inventory_profile = JSON.parse(lead.inventory_profile || '{}');

      // Fetch sales brief
      const brief = db.prepare('SELECT * FROM sales_briefs WHERE lead_id = ?').get(id);

      return sendJson(res, 200, {
        lead,
        salesBrief: brief || null
      });
    }

    // 3b. Mantis AI Live Search Endpoint
    if (method === 'GET' && pathname === '/api/mantisai/search') {
      const { searchMantisAi } = require('./sources/mantisai_adapter.js');
      const results = await searchMantisAi(parsedUrl.query);
      return sendJson(res, 200, {
        success: true,
        ...results,
        leads: results.results || []
      });
    }

    // 3c. Mantis AI Ingestion / Import Endpoint
    if (method === 'POST' && pathname === '/api/mantisai/import') {
      const { searchMantisAi } = require('./sources/mantisai_adapter.js');
      const body = await parseJsonBody(req);
      let itemsToIngest = [];
      if (Array.isArray(body.leads) && body.leads.length > 0) {
        itemsToIngest = body.leads;
      } else {
        const searchRes = await searchMantisAi(body);
        itemsToIngest = searchRes.results || [];
      }
      const settings = getSettingsMap(db);
      let ingested = 0;
      let skipped = 0;
      for (const item of itemsToIngest) {
        const candidate = {
          business_name: item.business_name,
          industry_category: item.industry_category || 'A',
          subcategory: item.subcategory || item.category_input || 'Industrial Supplier',
          entity_type: item.business_type || item.entity_type || 'Manufacturer',
          state: item.state,
          district: item.district || item.city,
          city: item.city,
          address: item.address,
          phone: item.phone,
          email: item.email,
          website: item.website,
          source_name: 'Mantis AI Local Intelligence',
          source_record_id: item.mantis_id || `mantis_${Date.now()}_${Math.random()}`,
          buying_signal: item.buying_signal,
          inventory_profile: item.inventory_profile,
          maps_rating: item.maps_rating,
          reviews_count: item.reviews_count
        };
        const resIngest = await processCandidateLead(db, candidate, settings);
        if (resIngest.status === 'INGESTED_SUCCESS') ingested++;
        else skipped++;
      }
      return sendJson(res, 200, {
        success: true,
        ingested,
        importedCount: ingested,
        skipped,
        total: itemsToIngest.length
      });
    }

    // 3d. CMO Executive Strategy & Market Intelligence Endpoint
    if (method === 'GET' && pathname === '/api/cmo/strategy') {
      const totalLeads = db.prepare('SELECT COUNT(*) as c FROM leads').get().c;
      const qualifiedLeads = db.prepare("SELECT COUNT(*) as c FROM leads WHERE pipeline_stage != 'DISCOVERED' AND lead_score >= 50").get().c;
      const contactedLeads = db.prepare("SELECT COUNT(*) as c FROM leads WHERE pipeline_stage = 'CONTACTED'").get().c;
      const meetingsBooked = db.prepare("SELECT COUNT(*) as c FROM leads WHERE pipeline_stage = 'MEETING_BOOKED'").get().c;
      const wonDeals = db.prepare("SELECT COUNT(*) as c FROM leads WHERE pipeline_stage = 'WON'").get().c;

      // CMO Market Intelligence Breakdown
      const clusterOpportunities = [
        {
          cluster: "Rajkot CNC, Forging & Machine Tools",
          state: "Gujarat",
          readiness: "High",
          idealOffer: "BOM Inventory & Machine Serial Number Tracking",
          dealPotentialInr: "₹45,000 – ₹75,000 per factory",
          keyPainPoint: "Sub-assembly BOM stockouts, imported bearing lead times, manual warranty service calls"
        },
        {
          cluster: "Coimbatore Pumps, Motors & Foundries",
          state: "Tamil Nadu",
          readiness: "High",
          idealOffer: "Pump Motor Component Inventory & Pressure Test Certification",
          dealPotentialInr: "₹35,000 – ₹60,000 per unit",
          keyPainPoint: "Cast-iron body stock variance, copper wire weight control, dealer credit management"
        },
        {
          cluster: "Pune Bhosari/Chakan Auto Ancillaries & Tooling",
          state: "Maharashtra",
          readiness: "Very High",
          idealOffer: "Press-Shop Die Maintenance & OEM Delivery Schedule Software",
          dealPotentialInr: "₹50,000 – ₹90,000 per plant",
          keyPainPoint: "High sheet nesting scrap, press die tool life logs, Tata/Bajaj daily delivery challans"
        },
        {
          cluster: "Tiruppur Cotton Knitwear & Apparel Exports",
          state: "Tamil Nadu",
          readiness: "High",
          idealOffer: "Fabric Roll Barcode Inventory & External Dye-House WIP Tracker",
          dealPotentialInr: "₹40,000 – ₹70,000 per export mill",
          keyPainPoint: "Yarn shrinkage variance, external dyeing lot matching, piece-rate cutting delays"
        },
        {
          cluster: "Faridabad Corrugated Packaging & Cartons",
          state: "Haryana",
          readiness: "Medium-High",
          idealOffer: "Kraft Reel Deckle Scrap Optimization & Box Die Tracker",
          dealPotentialInr: "₹30,000 – ₹55,000 per plant",
          keyPainPoint: "Paper GSM weight reconciliation, reel deckle offcuts waste, manual client box die ledger"
        }
      ];

      return sendJson(res, 200, {
        success: true,
        kpis: {
          weeklyPipelineTarget: '₹1,50,000',
          dailyOutreachQuota: '25 / day',
          currentFunnelEfficiency: totalLeads > 0 ? ((qualifiedLeads / totalLeads) * 100).toFixed(1) + '%' : '0%',
          contactToMeetingRate: contactedLeads > 0 ? ((meetingsBooked / contactedLeads) * 100).toFixed(1) + '%' : '0%'
        },
        clusters: clusterOpportunities.map(c => ({
          hub: c.cluster,
          state: c.state,
          readiness: c.readiness.toUpperCase(),
          recommendedSolution: c.idealOffer,
          typicalDealValue: c.dealPotentialInr,
          primaryFriction: c.keyPainPoint
        })),
        packages: [
          { name: "Starter Website & Google Business 3-Pack", price: "₹5,999", target: "Local businesses with No Website", salesCycle: "24-48 hrs" },
          { name: "B2B Product Catalogue with WhatsApp Ordering", price: "₹7,999", target: "Industrial wholesalers & job-shops", salesCycle: "3-5 days" },
          { name: "Factory Raw Material Inventory & BOM Tracker", price: "₹24,999", target: "Factories with multiple production stages", salesCycle: "7-14 days" },
          { name: "Global Export B2B Showcase & Multi-Currency RFQ", price: "₹14,999", target: "Export-oriented garment and handicraft units", salesCycle: "5-10 days" }
        ],
        cmoSummary: {
          currentFunnelEfficiency: totalLeads > 0 ? ((qualifiedLeads / totalLeads) * 100).toFixed(1) + '%' : '0%',
          contactToMeetingRate: contactedLeads > 0 ? ((meetingsBooked / contactedLeads) * 100).toFixed(1) + '%' : '0%',
          dailyOutreachTarget: 25,
          weeklyRevenueTargetInr: 150000,
          primaryChannelRecommendation: "Direct WhatsApp Message with 1-Page Interactive Digital Demo followed by Phone Consultation"
        },
        clusterOpportunities,
        topConversionOffers: [
          { name: "Starter Website & Google Business 3-Pack", priceInr: 5999, conversionSpeed: "Fast (24-48 hrs)", target: "Local businesses with No Website" },
          { name: "B2B Product Catalogue with WhatsApp Ordering", priceInr: 7999, conversionSpeed: "Fast (3-5 days)", target: "Industrial wholesalers & job-shops" },
          { name: "Factory Raw Material Inventory & BOM Tracker", priceInr: 24999, conversionSpeed: "Medium (7-14 days)", target: "Factories with multiple production stages" },
          { name: "Global Export B2B Showcase & Multi-Currency RFQ", priceInr: 14999, conversionSpeed: "Medium (5-10 days)", target: "Export-oriented garment and handicraft units" }
        ]
      });
    }

    // 4. Update Lead Record (Stage, Owner, Notes, Next Action)
    if (method === 'PATCH' && pathname.startsWith('/api/leads/')) {
      const id = pathname.replace('/api/leads/', '');
      const payload = await parseJsonBody(req);
      const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(id);

      if (!lead) {
        return sendJson(res, 404, { error: 'Lead not found' });
      }

      const now = new Date().toISOString();
      const audit = JSON.parse(lead.audit_history || '[]');
      const notes = JSON.parse(lead.notes || '[]');

      if (payload.pipeline_stage && payload.pipeline_stage !== lead.pipeline_stage) {
        audit.push({
          timestamp: now,
          action: 'STAGE_CHANGED',
          details: `Stage updated from ${lead.pipeline_stage} to ${payload.pipeline_stage}`
        });
      }

      if (payload.action_type) {
        audit.push({
          timestamp: now,
          author: payload.author || 'Kaushik',
          action: payload.action_type,
          details: payload.note || `Action ${payload.action_type} recorded by ${payload.author || 'Kaushik'}`
        });
      }

      if (payload.note && !payload.action_type) {
        notes.push({
          timestamp: now,
          author: payload.author || 'Sales Rep',
          text: payload.note
        });
      }

      db.prepare(`
        UPDATE leads
        SET pipeline_stage = COALESCE(?, pipeline_stage),
            assigned_owner = COALESCE(?, assigned_owner),
            next_action = COALESCE(?, next_action),
            follow_up_date = COALESCE(?, follow_up_date),
            verification_status = COALESCE(?, verification_status),
            notes = ?,
            audit_history = ?,
            updated_at = ?
        WHERE id = ?
      `).run(
        payload.pipeline_stage || null,
        payload.assigned_owner || null,
        payload.next_action || null,
        payload.follow_up_date || null,
        payload.verification_status || null,
        JSON.stringify(notes),
        JSON.stringify(audit),
        now,
        id
      );

      return sendJson(res, 200, { success: true, message: 'Lead updated successfully' });
    }

    // 4b. Team Unified Activity Feed API
    if (method === 'GET' && pathname === '/api/team/activity') {
      const rows = db.prepare(`
        SELECT id, business_name, city, state, phone, pipeline_stage, lead_score, audit_history, updated_at
        FROM leads
        WHERE audit_history != '[]' AND audit_history IS NOT NULL
        ORDER BY updated_at DESC
        LIMIT 50
      `).all();

      const activities = [];
      for (const r of rows) {
        let auditList = [];
        try { auditList = JSON.parse(r.audit_history || '[]'); } catch {}
        if (Array.isArray(auditList)) {
          for (const item of auditList) {
            activities.push({
              leadId: r.id,
              businessName: r.business_name,
              city: r.city,
              state: r.state,
              phone: r.phone,
              leadScore: r.lead_score,
              pipelineStage: r.pipeline_stage,
              author: item.author || (item.details?.includes('Kaushik') ? 'Kaushik' : (item.details?.includes('Pushpender') ? 'Pushpender' : (item.details?.includes('Priyanshu') ? 'Priyanshu' : 'Team'))),
              action: item.action || 'STAGE_CHANGED',
              details: item.details || item.text || 'Step logged',
              timestamp: item.timestamp || r.updated_at
            });
          }
        }
      }

      activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      return sendJson(res, 200, { success: true, activities: activities.slice(0, 50) });
    }

    // 4c. Interactive Factory Demo Website Preview Generator
    if (method === 'GET' && pathname.startsWith('/api/leads/') && pathname.endsWith('/preview-portal')) {
      const id = pathname.replace('/api/leads/', '').replace('/preview-portal', '');
      const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
      if (!lead) return sendJson(res, 404, { error: 'Lead not found' });

      let inv = {};
      try { inv = JSON.parse(lead.inventory_profile || '{}'); } catch {}

      const cleanPhone = (lead.phone || '').replace(/\D/g, '');
      const previewData = {
        leadId: lead.id,
        businessName: lead.business_name,
        tagline: `${lead.subcategory || 'Precision Manufacturing & Engineering'} • ${lead.city}, ${lead.state}`,
        city: lead.city,
        state: lead.state,
        phone: lead.phone,
        waPhone: cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone,
        certifications: ['ISO 9001:2015 Certified', 'MSME Udyam Verified', 'ZED Bronze Quality Benchmarked'],
        heroMessage: `Direct-From-Factory Supply: High precision industrial components engineered to exact tolerances with verifiable batch inspection.`,
        bomFlow: inv.bom_stages || ['Stage 1: Raw Material Inward & Ultrasonic Test', 'Stage 2: CNC Machining & Heat Treatment', 'Stage 3: Coordinate Measuring QC & WhatsApp Dispatch Notice'],
        products: [
          { name: `${lead.subcategory || 'Industrial'} Component Spec A-1`, desc: "High tensile hardened alloy, tolerance ±0.02mm, batch tested", moq: "500 Units" },
          { name: `${lead.subcategory || 'Industrial'} Assembly Part B-2`, desc: "Corrosion resistant surface finish, ISO compliant QC sheet attached", moq: "250 Units" },
          { name: `${lead.subcategory || 'Industrial'} Custom Batch C-3`, desc: "Tailored to buyer technical drawing (AutoCAD/SolidWorks)", moq: "100 Units" }
        ],
        dealerBenefits: [
          "Instant B2B Quotations on WhatsApp in 60 seconds",
          "Real-time Batch Scrap & Weight Loss QC Transparency",
          "Direct dispatch tracking with GST e-Way Bill integration"
        ],
        deployedBy: "Pushpender (Tech & Delivery)",
        slaTimeframe: "Ready for live custom domain deployment within 48 Hours"
      };

      return sendJson(res, 200, { success: true, preview: previewData });
    }

    // 4d. Instant Deal Closing & Pushpender Handover API
    if (method === 'POST' && pathname.startsWith('/api/leads/') && pathname.endsWith('/lock-deal')) {
      const id = pathname.replace('/api/leads/', '').replace('/lock-deal', '');
      const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
      if (!lead) return sendJson(res, 404, { error: 'Lead not found' });

      const body = await parseJsonBody(req);
      const advanceAmount = body.advanceAmount || 5000;
      const paymentRef = body.paymentRef || `UPI_ADV_${Date.now().toString().slice(-6)}`;
      const note = body.note || `Deal closed by Kaushik. Advance token ₹${advanceAmount} received via ${paymentRef}. Handed over to Pushpender for 48h factory portal deployment.`;

      const now = new Date().toISOString();
      const audit = JSON.parse(lead.audit_history || '[]');
      audit.push({
        timestamp: now,
        author: 'Kaushik',
        action: 'ADVANCE_TOKEN_RECEIVED',
        details: note,
        advanceAmount,
        paymentRef
      });

      db.prepare(`
        UPDATE leads
        SET pipeline_stage = 'WON',
            assigned_owner = 'Pushpender',
            next_action = 'Deploy Live Factory Portal (Pushpender)',
            audit_history = ?,
            updated_at = ?
        WHERE id = ?
      `).run(JSON.stringify(audit), now, id);

      return sendJson(res, 200, {
        success: true,
        message: `Deal locked! Advance ₹${advanceAmount} recorded. Handed over to Pushpender.`,
        leadId: id,
        newStage: 'WON'
      });
    }

    // 5. Bulk CSV Import API
    if (method === 'POST' && pathname === '/api/leads/import') {
      const body = await parseJsonBody(req);
      const csvContent = body.csvContent;
      const sourceName = body.sourceName || 'User CSV Import';

      if (!csvContent) {
        return sendJson(res, 400, { error: 'csvContent is required' });
      }

      const parseResult = await parseCsvContent(csvContent, sourceName);
      if (!parseResult.success) {
        return sendJson(res, 400, { error: parseResult.error });
      }

      const settings = getSettingsMap(db);
      let ingestedCount = 0;
      let duplicatesCount = 0;
      let suppressedCount = 0;

      for (const candidate of parseResult.leads) {
        const resPipeline = await processCandidateLead(db, candidate, settings);
        if (resPipeline.status === 'INGESTED_SUCCESS') ingestedCount++;
        else if (resPipeline.status === 'SKIPPED_DUPLICATE') duplicatesCount++;
        else if (resPipeline.status === 'BLOCKED_SUPPRESSION') suppressedCount++;
      }

      return sendJson(res, 200, {
        success: true,
        totalSubmitted: parseResult.leads.length,
        ingestedCount,
        duplicatesCount,
        suppressedCount,
        errors: parseResult.errors
      });
    }

    // 6. CSV Export API
    if (method === 'GET' && pathname === '/api/leads/export') {
      const q = parsedUrl.query;
      const state = q.state || '';
      const industry = q.industry || '';
      const opportunityTier = q.opportunity_tier || '';

      let whereClauses = ['1=1'];
      const params = [];
      if (state) { whereClauses.push('state = ?'); params.push(state); }
      if (industry) { whereClauses.push('industry_category = ?'); params.push(industry); }
      if (opportunityTier) { whereClauses.push('opportunity_tier = ?'); params.push(opportunityTier); }

      const rows = db.prepare(`
        SELECT id, business_name, industry_category, subcategory, state, city, pincode,
               phone, email, website, website_status, lead_score, opportunity_tier,
               pipeline_stage, source_name, discovery_date
        FROM leads
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY lead_score DESC
      `).all(...params);

      const headers = ['ID', 'Business Name', 'Category', 'Subcategory', 'State', 'City', 'PIN Code', 'Phone', 'Email', 'Website', 'Website Status', 'Lead Score', 'Priority Tier', 'Pipeline Stage', 'Source', 'Discovery Date'];
      let csv = headers.join(',') + '\n';

      for (const r of rows) {
        const line = [
          r.id,
          `"${(r.business_name || '').replace(/"/g, '""')}"`,
          r.industry_category,
          `"${(r.subcategory || '').replace(/"/g, '""')}"`,
          `"${(r.state || '').replace(/"/g, '""')}"`,
          `"${(r.city || '').replace(/"/g, '""')}"`,
          r.pincode || '',
          r.phone || '',
          r.email || '',
          r.website || '',
          r.website_status,
          r.lead_score,
          r.opportunity_tier,
          r.pipeline_stage,
          `"${(r.source_name || '').replace(/"/g, '""')}"`,
          r.discovery_date
        ].join(',');
        csv += line + '\n';
      }

      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="bharatgrowth_msme_leads.csv"'
      });
      return res.end(csv);
    }

    // 7. Sources Catalog API
    if (method === 'GET' && pathname === '/api/sources') {
      const sources = db.prepare('SELECT * FROM sources ORDER BY is_active DESC, name ASC').all();
      return sendJson(res, 200, { sources });
    }

    // 8. Trigger Discovery Job
    if (method === 'POST' && pathname === '/api/discovery/run') {
      const body = await parseJsonBody(req);
      const city = body.city || 'Surat';
      const state = body.state || 'Gujarat';
      const category = body.category || 'A';
      const count = parseInt(body.count || 20, 10);

      const result = await runBatchDiscoveryJob(city, state, category, count);
      return sendJson(res, 200, result);
    }

    // 9. Discovery Jobs History API
    if (method === 'GET' && pathname === '/api/discovery/jobs') {
      const jobs = db.prepare('SELECT * FROM discovery_jobs ORDER BY started_at DESC LIMIT 25').all();
      return sendJson(res, 200, { jobs });
    }

    // 10. Campaign Manager & Approval Queue
    if (method === 'GET' && pathname === '/api/campaigns') {
      // Leads pending contact approval (Qualified & Tier 1/2)
      const approvalQueue = db.prepare(`
        SELECT l.id, l.business_name, l.city, l.state, l.industry_category,
               l.phone, l.email, l.lead_score, l.opportunity_tier, l.pipeline_stage,
               b.primary_service_offer, b.outreach_email_en, b.outreach_whatsapp_en, b.outreach_email_hi
        FROM leads l
        LEFT JOIN sales_briefs b ON l.id = b.lead_id
        WHERE l.pipeline_stage IN ('QUALIFIED', 'APPROVED_FOR_CONTACT')
        ORDER BY l.lead_score DESC
        LIMIT 50
      `).all();

      const stats = {
        totalApproved: db.prepare("SELECT COUNT(*) as c FROM leads WHERE pipeline_stage = 'APPROVED_FOR_CONTACT'").get().c,
        totalContacted: db.prepare("SELECT COUNT(*) as c FROM leads WHERE pipeline_stage = 'CONTACTED'").get().c,
        totalReplied: db.prepare("SELECT COUNT(*) as c FROM leads WHERE pipeline_stage = 'REPLIED'").get().c,
        meetingsBooked: db.prepare("SELECT COUNT(*) as c FROM leads WHERE pipeline_stage = 'MEETING_BOOKED'").get().c
      };

      return sendJson(res, 200, { stats, approvalQueue });
    }

    // 11. Approve Lead for Contact
    if (method === 'POST' && pathname.startsWith('/api/campaigns/approve/')) {
      const leadId = pathname.replace('/api/campaigns/approve/', '');
      const now = new Date().toISOString();

      db.prepare(`
        UPDATE leads
        SET pipeline_stage = 'APPROVED_FOR_CONTACT',
            next_action = 'Ready for sales rep outreach',
            updated_at = ?
        WHERE id = ?
      `).run(now, leadId);

      return sendJson(res, 200, { success: true, message: `Lead ${leadId} approved for outreach` });
    }

    // 12. Record Outreach Sent
    if (method === 'POST' && pathname.startsWith('/api/campaigns/record-contact/')) {
      const leadId = pathname.replace('/api/campaigns/record-contact/', '');
      const body = await parseJsonBody(req);
      const now = new Date().toISOString();

      const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId);
      if (!lead) return sendJson(res, 404, { error: 'Lead not found' });

      const audit = JSON.parse(lead.audit_history || '[]');
      audit.push({
        timestamp: now,
        action: 'OUTREACH_TRANSMITTED',
        details: `Outreach sent via ${body.channel || 'Email'} by ${body.sender || 'Sales Rep'}`
      });

      db.prepare(`
        UPDATE leads
        SET pipeline_stage = 'CONTACTED',
            next_action = 'Follow up within 48 hours if no reply',
            follow_up_date = ?,
            audit_history = ?,
            updated_at = ?
        WHERE id = ?
      `).run(
        new Date(Date.now() + 48 * 3600 * 1000).toISOString().split('T')[0],
        JSON.stringify(audit),
        now,
        leadId
      );

      return sendJson(res, 200, { success: true, message: 'Contact status recorded' });
    }

    // 13. Settings API
    if (method === 'GET' && pathname === '/api/settings') {
      const settings = getSettingsMap(db);
      const suppression = db.prepare('SELECT * FROM suppression_list ORDER BY opt_out_date DESC LIMIT 50').all();
      return sendJson(res, 200, {
        settings,
        suppression,
        taxonomy: {
          states: INDIAN_STATES_AND_UTS,
          categories: MSME_CATEGORIES
        }
      });
    }

    if (method === 'POST' && pathname === '/api/settings') {
      const body = await parseJsonBody(req);
      const now = new Date().toISOString();
      const stmt = db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `);

      for (const [key, val] of Object.entries(body)) {
        stmt.run(key, JSON.stringify(val), now);
      }

      return sendJson(res, 200, { success: true, message: 'Settings saved successfully' });
    }

    // 14. Add Suppression Record
    if (method === 'POST' && pathname === '/api/suppression') {
      const body = await parseJsonBody(req);
      const crypto = require('node:crypto');
      const suppId = `supp_${crypto.randomBytes(4).toString('hex')}`;
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO suppression_list (id, identifier_type, identifier_val, business_name, opt_out_date, reason)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        suppId,
        body.identifier_type.toUpperCase(),
        body.identifier_val.trim(),
        body.business_name || null,
        now,
        body.reason || 'User requested opt-out'
      );

      return sendJson(res, 200, { success: true, message: 'Added to suppression list' });
    }

    // 15. Reports API
    if (method === 'GET' && pathname === '/api/reports') {
      const sourceQuality = db.prepare(`
        SELECT source_name,
               COUNT(*) as total_leads,
               SUM(CASE WHEN lead_score >= 60 THEN 1 ELSE 0 END) as qualified_leads,
               AVG(lead_score) as avg_score,
               SUM(CASE WHEN pipeline_stage = 'WON' THEN 1 ELSE 0 END) as conversions
        FROM leads
        GROUP BY source_name
      `).all();

      const regionMetrics = db.prepare(`
        SELECT state,
               COUNT(*) as total,
               SUM(CASE WHEN opportunity_tier = 'TIER_1_HIGH' THEN 1 ELSE 0 END) as tier_1_count,
               AVG(lead_score) as avg_score
        FROM leads
        GROUP BY state
        ORDER BY total DESC
      `).all();

      const serviceRevenue = [
        { service: 'Starter websites', basePrice: 5999, closedDeals: db.prepare("SELECT COUNT(*) as c FROM leads WHERE pipeline_stage = 'WON' AND services_needed LIKE '%Starter websites%'").get().c },
        { service: 'Product catalogues and B2B catalogues', basePrice: 7999, closedDeals: db.prepare("SELECT COUNT(*) as c FROM leads WHERE pipeline_stage = 'WON' AND services_needed LIKE '%Product catalogues%'").get().c },
        { service: 'Website maintenance & Modernization', basePrice: 6499, closedDeals: db.prepare("SELECT COUNT(*) as c FROM leads WHERE pipeline_stage = 'WON' AND services_needed LIKE '%maintenance%'").get().c },
        { service: 'Export-market digital positioning', basePrice: 14999, closedDeals: db.prepare("SELECT COUNT(*) as c FROM leads WHERE pipeline_stage = 'WON' AND services_needed LIKE '%Export%'").get().c }
      ];

      return sendJson(res, 200, {
        sourceQuality,
        regionMetrics,
        serviceRevenue
      });
    }

    // -------------------------------------------------------------
    // STATIC FILE SERVING
    // -------------------------------------------------------------
    let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

    // Prevent directory traversal
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      return res.end('Access Denied');
    }

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        // Fallback to index.html for SPA routing
        const indexPath = path.join(PUBLIC_DIR, 'index.html');
        fs.readFile(indexPath, (readErr, content) => {
          if (readErr) {
            res.writeHead(404);
            return res.end('404 Not Found');
          }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(content);
        });
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      fs.readFile(filePath, (readErr, content) => {
        if (readErr) {
          res.writeHead(500);
          return res.end('Internal Server Error');
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      });
    });

  } catch (error) {
    console.error('Server error:', error);
    sendJson(res, 500, { error: error.message });
  }
});

function startServer(port = PORT) {
  return new Promise((resolve) => {
    server.listen(port, () => {
      console.log(`BharatGrowth AI Engine running at http://localhost:${port}`);
      resolve(server);
    });
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { server, startServer };
