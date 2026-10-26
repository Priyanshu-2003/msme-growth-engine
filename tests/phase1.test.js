const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const { getDb } = require('../src/db/index.js');
const { server } = require('../src/server.js');

// Mock request / response helper matching server.test.js (Sandbox Safe)
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

test('PHASE 1: Approval Enforcement on Call Queue', async () => {
  const db = getDb();

  // Insert a controlled set of leads:
  // 1. Approved real lead with legal source and valid phone -> Should appear
  // 2. Discovered real lead -> Should NOT appear
  // 3. Approved demo lead (is_demo=1) -> Should NOT appear
  // 4. Approved suppressed lead -> Should NOT appear
  // 5. Approved lead without phone -> Should NOT appear
  // 6. Approved lead with unverified/unregistered source -> Should NOT appear

  db.prepare(`
    INSERT OR REPLACE INTO leads (id, business_name, normalized_name, industry_category, source_name, discovery_date, phone, city, state, pipeline_stage, is_demo, lead_score, created_at, updated_at)
    VALUES 
      ('lead-real-approved', 'Surat Real Textiles', 'surat real textiles', 'C', 'User-Provided Lead File (CSV / Excel)', '2026-10-25', '9825100001', 'Surat', 'Gujarat', 'APPROVED_FOR_CONTACT', 0, 85, '2026-10-25T00:00:00.000Z', '2026-10-25T00:00:00.000Z'),
      ('lead-real-discovered', 'Ahmedabad Steel', 'ahmedabad steel', 'C', 'User-Provided Lead File (CSV / Excel)', '2026-10-25', '9825100002', 'Ahmedabad', 'Gujarat', 'DISCOVERED', 0, 75, '2026-10-25T00:00:00.000Z', '2026-10-25T00:00:00.000Z'),
      ('lead-demo-approved', 'Demo Synthetic Weaving', 'demo synthetic weaving', 'C', 'Mantis AI Local Lead Intelligence (mantisai.in)', '2026-10-25', '9825100003', 'Surat', 'Gujarat', 'APPROVED_FOR_CONTACT', 1, 90, '2026-10-25T00:00:00.000Z', '2026-10-25T00:00:00.000Z'),
      ('lead-suppressed', 'Blocked Garments', 'blocked garments', 'C', 'User-Provided Lead File (CSV / Excel)', '2026-10-25', '9825100004', 'Surat', 'Gujarat', 'APPROVED_FOR_CONTACT', 0, 80, '2026-10-25T00:00:00.000Z', '2026-10-25T00:00:00.000Z'),
      ('lead-no-phone', 'Silent Mills', 'silent mills', 'C', 'User-Provided Lead File (CSV / Excel)', '2026-10-25', '', 'Surat', 'Gujarat', 'APPROVED_FOR_CONTACT', 0, 80, '2026-10-25T00:00:00.000Z', '2026-10-25T00:00:00.000Z'),
      ('lead-unregistered-source', 'Unverified Source Corp', 'unverified source corp', 'C', 'Sprint Deliverable File', '2026-10-25', '9825100005', 'Surat', 'Gujarat', 'APPROVED_FOR_CONTACT', 0, 80, '2026-10-25T00:00:00.000Z', '2026-10-25T00:00:00.000Z')
  `).run();

  // Add suppression entry
  db.prepare(`
    INSERT OR REPLACE INTO suppression_list (id, identifier_type, identifier_val, business_name, opt_out_date, reason)
    VALUES ('sup-1', 'PHONE', '9825100004', 'Blocked Garments', '2026-10-25', 'Requested DND opt-out')
  `).run();

  const res = await dispatch('/api/dialer/queue');
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(Array.isArray(res.json.queue), true);

  const ids = res.json.queue.map(l => l.id);
  assert.strictEqual(ids.includes('lead-real-approved'), true, 'Real approved lead must be in queue');
  assert.strictEqual(ids.includes('lead-real-discovered'), false, 'Non-approved lead must NOT be in queue');
  assert.strictEqual(ids.includes('lead-demo-approved'), false, 'Demo lead must NOT be in queue');
  assert.strictEqual(ids.includes('lead-suppressed'), false, 'Suppressed lead must NOT be in queue');
  assert.strictEqual(ids.includes('lead-no-phone'), false, 'Lead with empty phone must NOT be in queue');
  assert.strictEqual(ids.includes('lead-unregistered-source'), false, 'Lead with unverified source must NOT be in queue');
});

test('PHASE 1: Counters and Single Source of Truth in activity_logs', async () => {
  const db = getDb();

  // Record initial counts
  const initialStats = await dispatch('/api/dialer/stats');
  assert.strictEqual(initialStats.statusCode, 200);
  const startDials = initialStats.json.stats.dialsAttempted;
  const startConnected = initialStats.json.stats.callsConnected;
  const startConsent = initialStats.json.stats.consentGiven;
  const startDemos = initialStats.json.stats.demosBooked;

  // 1. Dial attempt
  await dispatch('/api/dialer/call', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: {
      leadId: 'lead-real-approved',
      outcome: 'dial_attempt',
      user: 'Caller'
    }
  });

  let statsRes = await dispatch('/api/dialer/stats');
  assert.strictEqual(statsRes.json.stats.dialsAttempted, startDials + 1);
  assert.strictEqual(statsRes.json.stats.callsConnected, startConnected);

  // 2. Outcome: Consent to send audit
  await dispatch('/api/dialer/call', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: {
      leadId: 'lead-real-approved',
      outcome: 'send_audit',
      user: 'Caller',
      notes: 'Agreed to receive audit on WhatsApp'
    }
  });

  statsRes = await dispatch('/api/dialer/stats');
  assert.strictEqual(statsRes.json.stats.callsConnected, startConnected + 1, 'send_audit implies call was connected');
  assert.strictEqual(statsRes.json.stats.consentGiven, startConsent + 1);

  // 3. Outcome: Demo Booked -> increments both callsConnected and demosBooked
  await dispatch('/api/dialer/call', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: {
      leadId: 'lead-real-approved',
      outcome: 'demo_booked',
      user: 'Caller',
      notes: 'Demo booked for Friday 4 PM'
    }
  });

  statsRes = await dispatch('/api/dialer/stats');
  assert.strictEqual(statsRes.json.stats.callsConnected, startConnected + 2);
  assert.strictEqual(statsRes.json.stats.demosBooked, startDemos + 1);

  // 4. Verify activity_logs table is the underlying single source of truth
  const rows = db.prepare('SELECT action_type FROM activity_logs WHERE lead_id = ?').all('lead-real-approved');
  const actionTypes = rows.map(r => r.action_type);
  assert.strictEqual(actionTypes.includes('DIAL_ATTEMPTED'), true);
  assert.strictEqual(actionTypes.includes('CONSENT_AUDIT_GIVEN'), true);
  assert.strictEqual(actionTypes.includes('DEMO_BOOKED'), true);
  assert.strictEqual(actionTypes.includes('CALL_CONNECTED'), true);
});

test('PHASE 1: Double-Click Deduplication (< 3s)', async () => {
  // Rapidly fire identical event for a fresh lead
  const res1 = await dispatch('/api/dialer/call', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: {
      leadId: 'lead-real-discovered',
      outcome: 'no_answer',
      user: 'DedupeCaller'
    }
  });
  assert.strictEqual(res1.statusCode, 200);
  assert.strictEqual(res1.json.success, true);
  assert.strictEqual(Boolean(res1.json.duplicate), false);

  // Immediate second click (duplicate within 3s)
  const res2 = await dispatch('/api/dialer/call', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: {
      leadId: 'lead-real-discovered',
      outcome: 'no_answer',
      user: 'DedupeCaller'
    }
  });
  assert.strictEqual(res2.statusCode, 200);
  assert.strictEqual(res2.json.duplicate, true);
});

test('PHASE 1: Scheduling Follow-ups with Validation', async () => {
  // Test validation rejection when required fields are missing
  const invalidRes = await dispatch('/api/follow-ups', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: {
      lead_id: 'lead-real-approved'
      // missing scheduled_date and scheduled_time
    }
  });
  assert.strictEqual(invalidRes.statusCode, 400);
  assert.strictEqual(invalidRes.json.error.includes('required'), true);

  // Today's date in YYYY-MM-DD
  const todayStr = new Date().toISOString().split('T')[0];

  // Create valid follow-up
  const validRes = await dispatch('/api/follow-ups', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: {
      lead_id: 'lead-real-approved',
      scheduled_date: todayStr,
      scheduled_time: '14:30',
      follow_up_type: 'CALL',
      notes: 'Follow up on sample catalogue review'
    }
  });
  assert.strictEqual(validRes.statusCode, 201);
  assert.strictEqual(validRes.json.success, true);
  const followUpId = validRes.json.followUpId;

  // Query /api/follow-ups/today
  const todayRes = await dispatch('/api/follow-ups/today');
  assert.strictEqual(todayRes.statusCode, 200);
  assert.strictEqual(todayRes.json.followUps.length >= 1, true);
  const found = todayRes.json.followUps.some(f => f.id === followUpId);
  assert.strictEqual(found, true);

  // Patch status to COMPLETED
  const patchRes = await dispatch(`/api/follow-ups/${followUpId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: { status: 'COMPLETED' }
  });
  assert.strictEqual(patchRes.statusCode, 200);
  assert.strictEqual(patchRes.json.followUp.status, 'COMPLETED');
});

test('PHASE 1: Script Versioning and 10-Version Pruning', async () => {
  const scriptKey = 'test_script_' + Date.now();
  // Create 12 sequential versions of a test script key
  for (let i = 1; i <= 12; i++) {
    const res = await dispatch('/api/scripts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: {
        script_key: scriptKey,
        title: 'Test Script Pitch',
        content: `Pitch version content ${i} for {{business_name}}`,
        user: 'Admin'
      }
    });
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.json.version, i);
  }

  // Fetch version history - should have exactly 10 versions (versions 3 through 12, versions 1 and 2 pruned)
  const historyRes = await dispatch(`/api/scripts/${scriptKey}/history`);
  assert.strictEqual(historyRes.statusCode, 200);
  assert.strictEqual(historyRes.json.history.length, 10, 'Must keep max 10 versions');
  assert.strictEqual(historyRes.json.history[0].version, 12, 'Latest version must be 12');
  assert.strictEqual(historyRes.json.history[9].version, 3, 'Oldest kept version must be 3');
});

test('PHASE 1: Mark as Live with live_url', async () => {
  const db = getDb();

  const markRes = await dispatch('/api/leads/lead-real-approved/mark-live', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: {
      live_url: 'https://surattextiles-catalog.in',
      notes: 'Configured WhatsApp button + Google Business Profile'
    }
  });
  assert.strictEqual(markRes.statusCode, 200);
  assert.strictEqual(markRes.json.success, true);
  assert.strictEqual(markRes.json.lead.live_url, 'https://surattextiles-catalog.in');

  // Verify lead updated in DB
  const lead = db.prepare('SELECT live_url, pipeline_stage FROM leads WHERE id = ?').get('lead-real-approved');
  assert.strictEqual(lead.live_url, 'https://surattextiles-catalog.in');

  // Clean up fixture leads to preserve data/msme.sqlite purity
  db.prepare("DELETE FROM leads WHERE id LIKE 'lead-%'").run();
  db.prepare("DELETE FROM suppression_list WHERE id = 'sup-1'").run();
});
