// tests/catalogue.test.js - Automated Tests for B2B Mobile Catalogue (Phase 2 Item A)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { getDb } = require('../src/db/index.js');
const { server } = require('../src/server.js');
const {
  buildWhatsAppLink,
  generateLocalBusinessJsonLd,
  generateCatalogueHtml,
  generateHandoverChecklist,
  exportCatalogueToDisk
} = require('../src/core/catalogue_generator.js');

// Helper to simulate HTTP requests without network overhead (Sandbox Safe)
function dispatch(url, options = {}) {
  return new Promise((resolve) => {
    const req = new EventEmitter();
    req.url = url;
    req.method = options.method || 'GET';
    req.headers = options.headers || {};

    let responseStatusCode = 200;
    let responseHeaders = {};
    let responseBody = '';

    const res = {
      writeHead(code, headers) {
        responseStatusCode = code;
        if (headers) responseHeaders = headers;
      },
      end(data) {
        if (data) responseBody += data.toString();
        let json = null;
        try { json = JSON.parse(responseBody); } catch {}
        resolve({
          statusCode: responseStatusCode,
          headers: responseHeaders,
          body: responseBody,
          json
        });
      }
    };

    const listener = server.listeners('request')[0];
    listener(req, res);

    if (options.body) {
      const payload = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      req.emit('data', Buffer.from(payload));
    }
    req.emit('end');
  });
}

test('Catalogue: WhatsApp link encoding with apostrophes, ₹, Hindi and Gujarati', () => {
  // 1. English with apostrophe and ₹
  const linkEn = buildWhatsAppLink({
    whatsapp_number: '919825100001',
    business_name: "Texmo's Pumps & Engineering",
    product_name: "Farmer's 5HP Submersible Pump (₹18,500)",
    moq: '10 Units',
    language: 'EN'
  });

  assert.strictEqual(linkEn.startsWith('https://wa.me/919825100001?text='), true);
  const textEn = decodeURIComponent(linkEn.split('text=')[1]);
  assert.strictEqual(textEn.includes("Texmo's Pumps & Engineering"), true);
  assert.strictEqual(textEn.includes("Farmer's 5HP Submersible Pump (₹18,500)"), true);
  assert.strictEqual(textEn.includes('(MOQ: 10 Units)'), true);

  // 2. Hindi text support
  const linkHi = buildWhatsAppLink({
    whatsapp_number: '919825100002',
    business_name: 'महावीर टेक्सटाइल्स',
    product_name: 'सिल्क साड़ी फैब्रिक (₹125)',
    moq: '500 मीटर',
    language: 'HI'
  });
  const textHi = decodeURIComponent(linkHi.split('text=')[1]);
  assert.strictEqual(textHi.includes('नमस्ते'), true);
  assert.strictEqual(textHi.includes('महावीर टेक्सटाइल्स'), true);
  assert.strictEqual(textHi.includes('सिल्क साड़ी फैब्रिक (₹125)'), true);

  // 3. Gujarati text support
  const linkGu = buildWhatsAppLink({
    whatsapp_number: '919825100003',
    business_name: 'શ્રી ગણેશ એન્ટરપ્રાઇઝ',
    product_name: 'કોટન યાર્ન (₹250)',
    moq: '200 કિલો',
    language: 'GU'
  });
  const textGu = decodeURIComponent(linkGu.split('text=')[1]);
  assert.strictEqual(textGu.includes('નમસ્તે'), true);
  assert.strictEqual(textGu.includes('શ્રી ગણેશ એન્ટરપ્રાઇઝ'), true);
  assert.strictEqual(textGu.includes('કોટન યાર્ન (₹250)'), true);

  // 4. Fallback placeholder phone
  const linkFallback = buildWhatsAppLink({
    whatsapp_number: '',
    business_name: 'Sample Works',
    product_name: 'Item A',
    language: 'EN'
  });
  assert.strictEqual(linkFallback.startsWith('https://wa.me/91XXXXXXXXXX?text='), true);
});

test('Catalogue: Open Graph, Twitter Cards, and Schema.org LocalBusiness JSON-LD', () => {
  const catalogue = {
    id: 'cat_test_seo',
    token: 'cat_seo_tok_123',
    business_name: 'Surat Premium Weaving',
    tagline: 'Wholesale B2B Jacquard Fabric Manufacturer',
    language: 'EN',
    whatsapp_number: '919825100001',
    phone: '+91 261 2450000',
    email: 'info@suratweaving.com',
    address: 'Ring Road Textile Market, Surat, Gujarat 395002',
    google_maps_url: 'https://maps.google.com/?q=Surat+Textile+Market',
    meta_description: 'Direct manufacturer of wholesale jacquard fabric in Surat.',
    products: [
      { id: 'p1', name: 'Zari Jacquard Saree', spec: '120 GSM', moq: '200 Metres', price: '₹140 / Metre', image_url: '', alt_text: 'Zari Jacquard' }
    ],
    verified_badges: ['Client-Verified GST Registered']
  };

  const jsonLd = JSON.parse(generateLocalBusinessJsonLd(catalogue));
  assert.strictEqual(jsonLd['@context'], 'https://schema.org');
  assert.strictEqual(jsonLd['@type'], 'LocalBusiness');
  assert.strictEqual(jsonLd.name, 'Surat Premium Weaving');
  assert.strictEqual(jsonLd.telephone, '+91 261 2450000');
  assert.strictEqual(jsonLd.hasMap, 'https://maps.google.com/?q=Surat+Textile+Market');

  const html = generateCatalogueHtml(catalogue);
  // OG & Twitter Meta Tags
  assert.strictEqual(html.includes('<meta property="og:title" content="Surat Premium Weaving — Official B2B Catalogue">'), true);
  assert.strictEqual(html.includes('<meta property="og:description" content="Direct manufacturer of wholesale jacquard fabric in Surat.">'), true);
  assert.strictEqual(html.includes('<meta name="twitter:card" content="summary_large_image">'), true);
  // JSON-LD embedded
  assert.strictEqual(html.includes('<script type="application/ld+json">'), true);
  // Offline embedded data
  assert.strictEqual(html.includes('window.CATALOGUE_DATA ='), true);
});

test('Catalogue: Strict API sanitization on /api/catalogues/:token (Zero Lead Field Leaks)', async () => {
  const db = getDb();
  const testToken = 'cat_leak_test_token_8899';
  const now = new Date().toISOString();

  // Create lead with sensitive internal data
  db.prepare(`
    INSERT OR REPLACE INTO leads (
      id, business_name, normalized_name, industry_category, source_name,
      discovery_date, lead_score, score_breakdown, notes, audit_history,
      pipeline_stage, services_needed, evidence, is_demo, city, state, created_at, updated_at
    ) VALUES (
      'lead_sensitive_01', 'Confidential Engineering', 'confidential engineering', 'F',
      'User-Provided Lead File (CSV / Excel)', '2026-10-25', 92,
      '{"digital_need":30,"commercial_fit":25}', '[{"text":"Sensitive negotiation notes"}]',
      '[{"action":"INTERNAL_CALL"}]', 'QUALIFIED', '["SEO","Catalogue"]', '["Competitor intel"]',
      0, 'Rajkot', 'Gujarat', ?, ?
    )
  `).run(now, now);

  // Create catalogue linked to this lead
  db.prepare(`
    INSERT OR REPLACE INTO catalogues (
      id, lead_id, token, business_name, tagline, language,
      whatsapp_number, phone, email, address, google_maps_url,
      products, verified_badges, meta_description, is_sample,
      created_at, updated_at
    ) VALUES (
      'cat_leak_01', 'lead_sensitive_01', ?, 'Confidential Engineering Public Catalogue',
      'Precision CNC Turned Parts', 'EN', '919825100099', '919825100099',
      'sales@confidential.com', 'Plot 9, GIDC, Rajkot, Gujarat',
      'https://maps.google.com/?q=Rajkot', '[]', '["GST Registered"]',
      'Public precision parts catalogue', 0, ?, ?
    )
  `).run(testToken, now, now);

  const res = await dispatch(`/api/catalogues/${testToken}`);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.json.success, true);

  const cat = res.json.catalogue;
  // Public fields must be present
  assert.strictEqual(cat.business_name, 'Confidential Engineering Public Catalogue');
  assert.strictEqual(cat.token, testToken);
  assert.strictEqual(cat.whatsapp_number, '919825100099');

  // CRITICAL SECURITY ASSERTION: Internal lead fields must NEVER leak
  assert.strictEqual(cat.lead_score, undefined, 'lead_score must NOT leak in catalogue API');
  assert.strictEqual(cat.score_breakdown, undefined, 'score_breakdown must NOT leak in catalogue API');
  assert.strictEqual(cat.notes, undefined, 'internal notes must NOT leak in catalogue API');
  assert.strictEqual(cat.audit_history, undefined, 'audit_history must NOT leak in catalogue API');
  assert.strictEqual(cat.pipeline_stage, undefined, 'pipeline_stage must NOT leak in catalogue API');
  assert.strictEqual(cat.services_needed, undefined, 'services_needed must NOT leak in catalogue API');
  assert.strictEqual(cat.evidence, undefined, 'evidence must NOT leak in catalogue API');

  // Clean up
  db.prepare("DELETE FROM catalogues WHERE token = ?").run(testToken);
  db.prepare("DELETE FROM leads WHERE id = 'lead_sensitive_01'").run();
});

test('Catalogue: POST /api/catalogues and Static Offline Export to Disk', async () => {
  const db = getDb();
  const createPayload = {
    business_name: 'Kaveri Pumps & Valves',
    tagline: 'Agricultural and Industrial Centrifugal Pumps',
    language: 'EN',
    whatsapp_number: '919842100000',
    phone: '+91 422 2540000',
    email: 'info@kaveripumps.in',
    address: 'Avarampalayam Road, Coimbatore, Tamil Nadu 641006',
    google_maps_url: 'https://maps.google.com/?q=Coimbatore',
    meta_description: 'Agricultural monobloc and openwell pumps direct from Coimbatore factory.',
    verified_badges: ['Client-Verified MSME Registered'],
    products: [
      {
        id: 'p_pump_01',
        name: '3HP Single Phase Monobloc Pump',
        spec: 'Head: 32m | Flow: 450 LPM | Cast Iron Impeller',
        moq: '5 Units',
        price: '₹14,200 / Unit',
        image_url: '',
        alt_text: 'Cast iron centrifugal monobloc pump'
      }
    ]
  };

  const createRes = await dispatch('/api/catalogues', {
    method: 'POST',
    body: createPayload
  });

  assert.strictEqual(createRes.statusCode, 201);
  assert.strictEqual(createRes.json.success, true);
  const token = createRes.json.catalogue.token;
  assert.strictEqual(token.startsWith('cat_'), true);
  assert.strictEqual(createRes.json.catalogue.catalogue_url, `/catalogue/${token}`);

  // Test Web Route GET /catalogue/:token
  const webRes = await dispatch(`/catalogue/${token}`);
  assert.strictEqual(webRes.statusCode, 200);
  assert.strictEqual(webRes.headers['Content-Type'].includes('text/html'), true);
  assert.strictEqual(webRes.body.includes('Kaveri Pumps & Valves'), true);
  assert.strictEqual(webRes.body.includes('3HP Single Phase Monobloc Pump'), true);
  assert.strictEqual(webRes.body.includes('Enquire on WhatsApp'), true);

  // Test Static Export API GET /api/catalogues/:token/export
  const exportRes = await dispatch(`/api/catalogues/${token}/export`);
  assert.strictEqual(exportRes.statusCode, 200);
  assert.strictEqual(exportRes.json.success, true);

  const exportDir = exportRes.json.export_dir;
  assert.strictEqual(fs.existsSync(exportDir), true);
  assert.strictEqual(fs.existsSync(path.join(exportDir, 'index.html')), true);
  assert.strictEqual(fs.existsSync(path.join(exportDir, 'style.css')), true);
  assert.strictEqual(fs.existsSync(path.join(exportDir, 'catalogue-data.js')), true);
  assert.strictEqual(fs.existsSync(path.join(exportDir, 'HANDOVER_CHECKLIST.md')), true);

  // Test Offline Opening of index.html from exported disk folder
  const exportedHtml = fs.readFileSync(path.join(exportDir, 'index.html'), 'utf8');
  assert.strictEqual(exportedHtml.includes('Kaveri Pumps & Valves'), true);
  assert.strictEqual(exportedHtml.includes('catalogue-data.js'), true);

  // Test Handover Checklist contents
  const checklist = fs.readFileSync(path.join(exportDir, 'HANDOVER_CHECKLIST.md'), 'utf8');
  assert.strictEqual(checklist.includes('# B2B Mobile Catalogue Client Handover Checklist'), true);
  assert.strictEqual(checklist.includes('Hosting & Domain Ownership'), true);
  assert.strictEqual(checklist.includes('How to Update Products Offline'), true);

  // Clean up
  db.prepare("DELETE FROM catalogues WHERE token = ?").run(token);
  db.prepare("DELETE FROM activity_logs WHERE action_type = 'CATALOGUE_SAVED' AND metadata LIKE ?", [`%${token}%`]).run();
  try { fs.rmSync(exportDir, { recursive: true, force: true }); } catch {}
});
