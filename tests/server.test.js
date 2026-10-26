// tests/server.test.js - In-memory HTTP Server and API tests (Sandbox Safe)
const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const { server } = require('../src/server.js');

// Mock request / response helper to test HTTP handler without network sockets
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

    // Get the request listener from server
    const listener = server.listeners('request')[0];
    listener(req, res);

    if (options.body) {
      const payload = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      req.emit('data', Buffer.from(payload));
    }
    req.emit('end');
  });
}

test('API In-Memory Integration Tests', async (t) => {
  await t.test('GET /api/dashboard returns KPIs and funnels', async () => {
    const res = await dispatch('/api/dashboard');
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.json.kpis);
    assert.ok(res.json.kpis.totalLeads >= 10);
    assert.ok(res.json.funnel);
    assert.ok(Array.isArray(res.json.stateBreakdown));
  });

  await t.test('GET /api/leads returns paginated list', async () => {
    const res = await dispatch('/api/leads?limit=5');
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.leads.length, 5);
    assert.ok(res.json.totalCount >= 10);
  });

  await t.test('GET /api/leads/:id returns full detail and sales brief', async () => {
    const listRes = await dispatch('/api/leads?limit=1');
    const firstLead = listRes.json.leads[0];

    const res = await dispatch(`/api/leads/${firstLead.id}`);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.lead.id, firstLead.id);
    assert.ok(res.json.salesBrief);
    assert.ok(res.json.salesBrief.outreach_email_en);
    assert.ok(res.json.salesBrief.outreach_email_hi);
  });

  await t.test('PATCH /api/leads/:id updates stage and notes', async () => {
    const listRes = await dispatch('/api/leads?limit=1');
    const firstLead = listRes.json.leads[0];

    const patchRes = await dispatch(`/api/leads/${firstLead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: { pipeline_stage: 'QUALIFIED', note: 'Test verified contact via integration test' }
    });
    assert.strictEqual(patchRes.statusCode, 200);
    assert.strictEqual(patchRes.json.success, true);
  });

  await t.test('POST /api/leads/import handles bulk CSV', async () => {
    const randomPhone = '98' + Math.floor(10000000 + Math.random() * 90000000);
    const csvSample = `Firm Name,Phone,Email,City,State,Category,Website\nTest Fasteners ${Date.now()},${randomPhone},sales@testfasteners.in,Ludhiana,Punjab,Industrial Hardware,`;
    const res = await dispatch('/api/leads/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { csvContent: csvSample, sourceName: 'Integration Test Import' }
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.success, true);
    assert.strictEqual(res.json.ingestedCount, 1);
  });

  await t.test('GET /api/leads/export streams CSV download', async () => {
    const res = await dispatch('/api/leads/export');
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.headers['Content-Type'].includes('text/csv'));
    assert.ok(res.body.includes('Business Name'));
    assert.ok(res.body.includes('Lead Score'));
  });

  await t.test('GET /api/sources returns legal registry', async () => {
    const res = await dispatch('/api/sources');
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.json.sources.length >= 3);
  });

  await t.test('GET /api/campaigns returns approval queue and stats', async () => {
    const res = await dispatch('/api/campaigns');
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.json.stats);
    assert.ok(Array.isArray(res.json.approvalQueue));
  });

  await t.test('GET /api/settings and POST /api/settings updates dynamic weights', async () => {
    const getRes = await dispatch('/api/settings');
    assert.strictEqual(getRes.statusCode, 200);
    assert.ok(getRes.json.settings.weight_digital_need);

    const postRes = await dispatch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { weight_digital_need: 32 }
    });
    assert.strictEqual(postRes.statusCode, 200);
    assert.strictEqual(postRes.json.success, true);
  });

  await t.test('GET /api/cmo/strategy returns executive KPIs, clusters, and packages', async () => {
    const res = await dispatch('/api/cmo/strategy');
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.success, true);
    assert.ok(res.json.kpis);
    assert.ok(Array.isArray(res.json.clusters));
    assert.ok(Array.isArray(res.json.packages));
    assert.ok(res.json.clusters.length > 0);
  });

  await t.test('GET /api/mantisai/search returns live map-first factory leads with signals', async () => {
    const res = await dispatch('/api/mantisai/search?city=Rajkot');
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.success, true);
    assert.ok(Array.isArray(res.json.leads));
    assert.ok(res.json.leads.length > 0);
    assert.ok(res.json.leads[0].inventory_profile);
    assert.ok(res.json.leads[0].buying_signal);
  });

  await t.test('POST /api/mantisai/import ingests discovered leads with inventory profile', async () => {
    const dummyLead = {
      business_name: `Test Precision Valve Co ${Date.now()}`,
      phone: `98765${Math.floor(10000 + Math.random() * 90000)}`,
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411018',
      industry_category: 'F',
      subcategory: 'Auto Ancillaries',
      website: '',
      website_status: 'NO_WEBSITE_FOUND',
      buying_signal: 'Expanding to Tier-2 Auto OEM supplier',
      maps_rating: 4.8,
      reviews_count: 55,
      inventory_profile: {
        raw_materials_tracked: ['Cast Iron Billets', 'Hydraulic Seals'],
        bom_stages: ['Turning', 'Milling', 'Pressure Testing'],
        scrap_rate_variance: 'Target 3.5%',
        dealer_network: { dealers_count: 8, dispatch_tat_hours: 24 }
      }
    };

    const res = await dispatch('/api/mantisai/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { leads: [dummyLead] }
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.success, true);
    assert.strictEqual(res.json.importedCount, 1);
  });

  await t.test('GET /api/team/activity returns team activity stream', async () => {
    const res = await dispatch('/api/team/activity');
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.success, true);
    assert.ok(Array.isArray(res.json.activities));
  });

  await t.test('GET /api/leads/:id/preview-portal returns factory portal mockup', async () => {
    const listRes = await dispatch('/api/leads?limit=1');
    const leadId = listRes.json.leads[0].id;
    const res = await dispatch(`/api/leads/${leadId}/preview-portal`);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.success, true);
    assert.ok(res.json.preview.businessName);
    assert.ok(res.json.preview.bomFlow);
    assert.ok(res.json.preview.products);
  });

  await t.test('POST /api/leads/:id/lock-deal updates stage to WON and records advance', async () => {
    const listRes = await dispatch('/api/leads?limit=1');
    const leadId = listRes.json.leads[0].id;
    const res = await dispatch(`/api/leads/${leadId}/lock-deal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { advanceAmount: 5000, paymentRef: 'UPI_ADV_778129' }
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.success, true);
    assert.strictEqual(res.json.newStage, 'WON');
  });

  await t.test('GET /api/reports returns financialMetrics and live deal ledger', async () => {
    const res = await dispatch('/api/reports');
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.json.financialMetrics);
    const fm = res.json.financialMetrics;
    assert.ok(fm.totalAddressablePipeline > 0);
    assert.strictEqual(fm.packagePrice, 7999);
    assert.strictEqual(fm.foundingPrice, 5999);
    assert.ok(Array.isArray(fm.dealLedger));
  });

  await t.test('GET /api/leads/:id/invoice returns structured GST proforma invoice', async () => {
    const listRes = await dispatch('/api/leads?limit=1');
    const leadId = listRes.json.leads[0].id;
    const res = await dispatch(`/api/leads/${leadId}/invoice`);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.success, true);
    assert.ok(res.json.invoice);
    assert.ok(res.json.invoice.invoiceNumber.startsWith('INDUS-'));
    assert.strictEqual(res.json.invoice.subtotal, 7999);
    assert.strictEqual(res.json.invoice.totalAmount, 5999);
    assert.ok(res.json.invoice.upiPayLink.startsWith('upi://pay?'));
  });

  await t.test('Static files: GET / returns HTML application', async () => {
    const res = await dispatch('/');
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.body.includes('IndusOS'));
    assert.ok(res.body.includes('id="page-title"'));
    assert.ok(res.body.includes('Dashboard'));
  });

  await t.test('Public Prospect Portal: GET /portal/:id returns standalone portal.html', async () => {
    const res = await dispatch('/portal/lead_00b9b78d89f6');
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.body.includes('Factory B2B Portal & Live Digital Twin'));
    assert.ok(res.body.includes('tab-rfq-calc'));
    assert.ok(res.body.includes('slider-inward'));
  });

  await t.test('Lead Audit Report API: GET /api/leads/:id/audit-report returns structured diagnostic findings', async () => {
    const res = await dispatch('/api/leads/lead_00b9b78d89f6/audit-report');
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.success, true);
    assert.ok(res.json.audit);
    assert.ok(Array.isArray(res.json.audit.findings));
    assert.ok(res.json.audit.findings.length >= 4);
    assert.ok(res.json.audit.businessLossEstimate.estimatedRevenueLeakage);
  });

  await t.test('Lead Audit Report View: GET /audit/:id returns 1-page report HTML', async () => {
    const res = await dispatch('/audit/lead_00b9b78d89f6');
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.body.includes('Enterprise Digital & Dealer Ordering Audit Report'));
    assert.ok(res.body.includes('loss-callout'));
  });

  t.after(() => {
    const { getDb } = require('../src/db/index.js');
    const db = getDb();
    db.prepare("DELETE FROM leads WHERE business_name LIKE '%test%' OR business_name LIKE '%1792%'").run();
    const l = db.prepare("SELECT id, audit_history FROM leads WHERE id = 'lead_00b9b78d89f6'").get();
    if (l) {
      let audits = JSON.parse(l.audit_history || '[]');
      audits = audits.filter(a => !JSON.stringify(a).includes('TEST') && a.action !== 'STAGE_CHANGED');
      db.prepare("UPDATE leads SET audit_history = ? WHERE id = ?").run(JSON.stringify(audits), l.id);
    }
  });
});
