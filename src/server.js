// src/server.js - High-performance Node.js HTTP Server & REST API for BharatGrowth AI
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const crypto = require('node:crypto');
const { getDb } = require('./db/index.js');
const { parseCsvContent } = require('./sources/csv_adapter.js');
const { processCandidateLead, runBatchDiscoveryJob, getSettingsMap } = require('./core/operations_manager.js');
const { INDIAN_STATES_AND_UTS, MSME_CATEGORIES } = require('./core/taxonomy.js');
const { generateCatalogueHtml, exportCatalogueToDisk } = require('./core/catalogue_generator.js');

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
      const limit = Math.max(1, Math.min(500, parseInt(q.limit || '20', 10)));
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
               pipeline_stage, assigned_owner, next_action, follow_up_date, discovery_date
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
    if (method === 'GET' && pathname.startsWith('/api/leads/') && !pathname.includes('export') && !pathname.includes('preview-portal') && !pathname.includes('invoice') && !pathname.includes('audit-report')) {
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
          { name: "B2B Product Catalogue with WhatsApp Ordering (List Price)", price: "₹7,999", target: "MSME manufacturers & wholesalers", salesCycle: "24-48 hrs" },
          { name: "Founding Client Special (First 3 Clients)", price: "₹5,999", target: "Requires testimonial, 1 referral & case study", salesCycle: "Immediate (₹2,000 advance)" }
        ],
        cmoSummary: {
          currentFunnelEfficiency: totalLeads > 0 ? ((qualifiedLeads / totalLeads) * 100).toFixed(1) + '%' : '0%',
          contactToMeetingRate: contactedLeads > 0 ? ((meetingsBooked / contactedLeads) * 100).toFixed(1) + '%' : '0%',
          dailyOutreachTarget: 25,
          weeklyRevenueTargetInr: 25000,
          primaryChannelRecommendation: "Phone Call First, followed by 1-Page WhatsApp Audit upon verbal consent"
        },
        clusterOpportunities,
        topConversionOffers: [
          { name: "B2B Product Catalogue with WhatsApp Ordering (List Price)", priceInr: 7999, conversionSpeed: "Fast (24-48 hrs)", target: "MSME manufacturers & wholesalers" },
          { name: "Founding Client Special (First 3 Clients)", priceInr: 5999, conversionSpeed: "Immediate (₹2,000 advance)", target: "Requires testimonial, 1 referral & case study" }
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

    // 4b. Team Unified Activity Feed API (Derived directly from activity_logs)
    if (method === 'GET' && pathname === '/api/team/activity') {
      const rows = db.prepare(`
        SELECT a.id, a.user as author, a.action_type as action, a.lead_id as leadId, a.metadata, a.created_at as timestamp,
               l.business_name as businessName, l.city, l.state, l.phone, l.lead_score as leadScore, l.pipeline_stage as pipelineStage
        FROM activity_logs a
        LEFT JOIN leads l ON a.lead_id = l.id
        ORDER BY a.created_at DESC
        LIMIT 50
      `).all();

      const activities = rows.map(r => {
        let meta = {};
        try { meta = JSON.parse(r.metadata || '{}'); } catch (e) {}
        return {
          id: r.id,
          leadId: r.leadId,
          businessName: r.businessName || 'MSME Enterprise',
          city: r.city || '',
          state: r.state || '',
          phone: r.phone || '',
          leadScore: r.leadScore || 0,
          pipelineStage: r.pipelineStage || 'DISCOVERED',
          author: r.author || 'User',
          action: r.action,
          details: meta.notes || meta.details || meta.note || `Action ${r.action} recorded`,
          timestamp: r.timestamp
        };
      });

      return sendJson(res, 200, {
        success: true,
        totalEvents: activities.length,
        activities
      });
    }

    // -------------------------------------------------------------
    // PHASE 1: CALLING WORKFLOW & COMPLIANCE ENDPOINTS
    // -------------------------------------------------------------

    // 4b-1. Speed Dialer Queue API (Strictly APPROVED_FOR_CONTACT, not in suppression list, is_demo = 0, legal source only)
    if (method === 'GET' && pathname === '/api/dialer/queue') {
      const queue = db.prepare(`
        SELECT l.*, b.primary_service_offer, b.outreach_call_script_en, b.outreach_call_script_hi
        FROM leads l
        LEFT JOIN sales_briefs b ON l.id = b.lead_id
        LEFT JOIN suppression_list s ON (l.normalized_phone = s.identifier_val OR l.phone = s.identifier_val OR l.normalized_domain = s.identifier_val)
        WHERE l.pipeline_stage = 'APPROVED_FOR_CONTACT'
          AND COALESCE(l.is_demo, 0) = 0
          AND s.id IS NULL
          AND l.phone IS NOT NULL AND LENGTH(TRIM(l.phone)) >= 8
          AND l.source_name IN (SELECT name FROM sources WHERE is_active = 1 AND commercial_reuse_allowed = 1)
        ORDER BY l.lead_score DESC
        LIMIT 200
      `).all();

      return sendJson(res, 200, {
        success: true,
        count: queue.length,
        leads: queue,
        queue
      });
    }

    // 4b-2. Speed Calling Outcome & Dial Attempt Logger (With 3s Dedupe Protection)
    if (method === 'POST' && pathname === '/api/dialer/call') {
      const body = await parseJsonBody(req);
      const leadId = body.leadId;
      const outcome = body.outcome; // 'dial_attempt', 'no_answer', 'wrong_number', 'not_interested', 'call_back', 'send_audit', 'demo_booked'
      const user = body.user || 'Caller';
      const notes = (body.notes || '').trim();
      const now = new Date().toISOString();

      if (!leadId) {
        return sendJson(res, 400, { error: 'leadId is required' });
      }

      const outcomeActionMap = {
        'dial_attempt': 'DIAL_ATTEMPTED',
        'no_answer': 'CALL_NO_ANSWER',
        'wrong_number': 'CALL_WRONG_NUMBER',
        'not_interested': 'CALL_NOT_INTERESTED',
        'call_back': 'CALL_BACK_REQUESTED',
        'send_audit': 'CONSENT_AUDIT_GIVEN',
        'demo_booked': 'DEMO_BOOKED'
      };

      const actionType = outcomeActionMap[outcome];
      if (!actionType) {
        return sendJson(res, 400, { error: `Invalid outcome. Must be one of: ${Object.keys(outcomeActionMap).join(', ')}` });
      }

      // Double-click protection: Server-side dedupe of identical events within 3000 ms (3 seconds)
      const recentDup = db.prepare(`
        SELECT id, created_at FROM activity_logs
        WHERE lead_id = ? AND user = ? AND action_type = ?
        ORDER BY created_at DESC LIMIT 1
      `).get(leadId, user, actionType);

      if (recentDup && (new Date(now).getTime() - new Date(recentDup.created_at).getTime()) < 3000) {
        return sendJson(res, 200, {
          success: true,
          duplicate: true,
          message: 'Duplicate event debounced (< 3s)',
          logId: recentDup.id
        });
      }

      const logId = `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      db.prepare(`
        INSERT INTO activity_logs (id, user, action_type, lead_id, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(logId, user, actionType, leadId, JSON.stringify({ outcome, notes }), now);

      // Connected call actions
      const connectedOutcomes = ['not_interested', 'call_back', 'send_audit', 'demo_booked'];
      if (connectedOutcomes.includes(outcome)) {
        db.prepare(`
          INSERT INTO activity_logs (id, user, action_type, lead_id, metadata, created_at)
          VALUES (?, ?, 'CALL_CONNECTED', ?, ?, ?)
        `).run(`act_conn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`, user, leadId, JSON.stringify({ outcome, notes }), now);
      }

      // Stage and next action mapping
      let targetStage = null;
      let nextAction = null;
      if (outcome === 'no_answer' || outcome === 'not_interested' || outcome === 'call_back' || outcome === 'send_audit') {
        targetStage = 'CONTACTED';
        nextAction = outcome === 'call_back' ? 'Call back requested by prospect' : (outcome === 'send_audit' ? 'Send WhatsApp Audit Report' : 'Follow up in 48h');
      } else if (outcome === 'demo_booked') {
        targetStage = 'MEETING_BOOKED';
        nextAction = 'Prepare demo for client meeting';
      }

      if (targetStage) {
        const lead = db.prepare('SELECT audit_history FROM leads WHERE id = ?').get(leadId);
        let audit = [];
        try { audit = JSON.parse(lead?.audit_history || '[]'); } catch (e) {}
        audit.push({
          timestamp: now,
          author: user,
          action: actionType,
          details: notes || `Outcome: ${outcome}`
        });

        db.prepare(`
          UPDATE leads
          SET pipeline_stage = ?,
              next_action = COALESCE(?, next_action),
              audit_history = ?,
              updated_at = ?
          WHERE id = ?
        `).run(targetStage, nextAction, JSON.stringify(audit), now, leadId);
      }

      return sendJson(res, 200, {
        success: true,
        logId,
        actionType,
        leadId,
        newStage: targetStage
      });
    }

    // 4b-3. Speed Calling Counters API (Derived strictly from activity_logs)
    if (method === 'GET' && pathname === '/api/dialer/stats') {
      const dialsAttempted = db.prepare("SELECT COUNT(*) as c FROM activity_logs WHERE action_type = 'DIAL_ATTEMPTED'").get().c;
      const callsConnected = db.prepare("SELECT COUNT(*) as c FROM activity_logs WHERE action_type = 'CALL_CONNECTED'").get().c;
      const consentGiven = db.prepare("SELECT COUNT(*) as c FROM activity_logs WHERE action_type = 'CONSENT_AUDIT_GIVEN'").get().c;
      const demosBooked = db.prepare("SELECT COUNT(*) as c FROM activity_logs WHERE action_type = 'DEMO_BOOKED'").get().c;

      return sendJson(res, 200, {
        success: true,
        stats: {
          dialsAttempted,
          callsConnected,
          consentGiven,
          demosBooked
        }
      });
    }

    // 4b-4. Follow-ups Scheduling APIs
    if (method === 'GET' && pathname === '/api/follow-ups/today') {
      const todayDate = new Date().toISOString().split('T')[0];
      const followUps = db.prepare(`
        SELECT f.*, l.business_name, l.city, l.phone, l.lead_score, l.pipeline_stage
        FROM follow_ups f
        JOIN leads l ON f.lead_id = l.id
        WHERE f.scheduled_date <= ? AND f.status = 'PENDING'
        ORDER BY f.scheduled_date ASC, f.scheduled_time ASC
      `).all(todayDate);

      return sendJson(res, 200, { success: true, count: followUps.length, followUps });
    }

    if (method === 'GET' && pathname === '/api/follow-ups') {
      const leadId = parsedUrl.query?.leadId;
      let followUps = [];
      if (leadId) {
        followUps = db.prepare('SELECT * FROM follow_ups WHERE lead_id = ? ORDER BY scheduled_date DESC, scheduled_time DESC').all(leadId);
      } else {
        followUps = db.prepare(`
          SELECT f.*, l.business_name, l.city, l.phone
          FROM follow_ups f
          JOIN leads l ON f.lead_id = l.id
          ORDER BY f.scheduled_date ASC, f.scheduled_time ASC
          LIMIT 50
        `).all();
      }
      return sendJson(res, 200, { success: true, followUps });
    }

    if (method === 'POST' && pathname === '/api/follow-ups') {
      const body = await parseJsonBody(req);
      const { lead_id, scheduled_date, scheduled_time, notes, created_by } = body;
      const follow_up_type = body.follow_up_type || body.type;

      if (!lead_id || !scheduled_date || !scheduled_time || !follow_up_type) {
        return sendJson(res, 400, { error: 'lead_id, scheduled_date, scheduled_time, and follow_up_type are required' });
      }

      const typeUpper = follow_up_type.toUpperCase();
      if (!['CALL', 'MEETING'].includes(typeUpper)) {
        return sendJson(res, 400, { error: "follow_up_type must be 'CALL' or 'MEETING'" });
      }

      // Check lead exists
      const lead = db.prepare('SELECT id, business_name FROM leads WHERE id = ?').get(lead_id);
      if (!lead) return sendJson(res, 404, { error: 'Lead not found' });

      const now = new Date().toISOString();
      const followUpId = `fu_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const user = created_by || 'Caller';

      db.prepare(`
        INSERT INTO follow_ups (id, lead_id, scheduled_date, scheduled_time, follow_up_type, notes, status, created_at, created_by)
        VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
      `).run(followUpId, lead_id, scheduled_date, scheduled_time, typeUpper, notes || '', now, user);

      // Log to activity_logs
      db.prepare(`
        INSERT INTO activity_logs (id, user, action_type, lead_id, metadata, created_at)
        VALUES (?, ?, 'FOLLOW_UP_SCHEDULED', ?, ?, ?)
      `).run(`act_fu_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`, user, lead_id, JSON.stringify({ followUpId, scheduled_date, scheduled_time, follow_up_type: typeUpper, notes }), now);

      // Update lead
      db.prepare(`
        UPDATE leads
        SET follow_up_date = ?,
            next_action = ?,
            updated_at = ?
        WHERE id = ?
      `).run(`${scheduled_date} ${scheduled_time}`, `Scheduled ${typeUpper}: ${notes || 'Follow-up'}`, now, lead_id);

      return sendJson(res, 201, { success: true, followUpId, message: 'Follow-up scheduled successfully' });
    }

    if (method === 'PATCH' && pathname.startsWith('/api/follow-ups/')) {
      const id = pathname.replace('/api/follow-ups/', '');
      const body = await parseJsonBody(req);
      const status = (body.status || 'COMPLETED').toUpperCase();

      if (!['PENDING', 'COMPLETED', 'CANCELLED'].includes(status)) {
        return sendJson(res, 400, { error: "Status must be PENDING, COMPLETED, or CANCELLED" });
      }

      db.prepare('UPDATE follow_ups SET status = ? WHERE id = ?').run(status, id);
      return sendJson(res, 200, {
        success: true,
        message: `Follow-up status updated to ${status}`,
        status,
        followUp: { id, status }
      });
    }

    // 4b-5. Pitch & Script Editing APIs (With 10-Version History)
    if (method === 'GET' && pathname === '/api/scripts') {
      const scripts = db.prepare(`
        SELECT s.* FROM scripts s
        INNER JOIN (
          SELECT script_key, MAX(version) as max_v
          FROM scripts GROUP BY script_key
        ) mv ON s.script_key = mv.script_key AND s.version = mv.max_v
        ORDER BY s.script_key ASC
      `).all();
      return sendJson(res, 200, { success: true, scripts });
    }

    if (method === 'GET' && pathname.startsWith('/api/scripts/') && pathname.endsWith('/history')) {
      const key = pathname.replace('/api/scripts/', '').replace('/history', '');
      const history = db.prepare('SELECT * FROM scripts WHERE script_key = ? ORDER BY version DESC LIMIT 10').all(key);
      return sendJson(res, 200, { success: true, scriptKey: key, history });
    }

    if (method === 'POST' && pathname === '/api/scripts') {
      const body = await parseJsonBody(req);
      const script_key = body.script_key || body.key;
      const { channel, language, title, content, user } = body;

      if (!script_key || !title || !content) {
        return sendJson(res, 400, { error: 'script_key, title, and content are required' });
      }

      const current = db.prepare('SELECT MAX(version) as max_v FROM scripts WHERE script_key = ?').get(script_key);
      const nextVersion = (current?.max_v || 0) + 1;
      const now = new Date().toISOString();
      const id = `scr_${script_key}_v${nextVersion}_${Date.now()}`;
      const author = user || 'Admin';

      db.prepare(`
        INSERT INTO scripts (id, script_key, channel, language, title, content, version, created_at, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, script_key, channel || 'CALL', language || 'EN', title, content, nextVersion, now, author);

      // Keep only last 10 versions
      db.prepare(`
        DELETE FROM scripts
        WHERE script_key = ? AND id NOT IN (
          SELECT id FROM scripts WHERE script_key = ? ORDER BY version DESC LIMIT 10
        )
      `).run(script_key, script_key);

      // Log script update in activity_logs
      db.prepare(`
        INSERT INTO activity_logs (id, user, action_type, lead_id, metadata, created_at)
        VALUES (?, ?, 'SCRIPT_UPDATED', NULL, ?, ?)
      `).run(`act_scr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`, author, JSON.stringify({ script_key, version: nextVersion, title }), now);

      return sendJson(res, 201, {
        success: true,
        message: `Script ${script_key} updated to version ${nextVersion}`,
        version: nextVersion
      });
    }

    // 4b-6. Mark as Live (Replaces simulator with real URL recording)
    if (method === 'POST' && pathname.startsWith('/api/leads/') && pathname.endsWith('/mark-live')) {
      const id = pathname.replace('/api/leads/', '').replace('/mark-live', '');
      const body = await parseJsonBody(req);
      const liveUrl = (body.liveUrl || body.live_url || '').trim();
      const notes = (body.notes || '').trim();
      const user = body.user || 'Engineering';

      if (!liveUrl) {
        return sendJson(res, 400, { error: 'liveUrl is required' });
      }

      const now = new Date().toISOString();
      const lead = db.prepare('SELECT audit_history FROM leads WHERE id = ?').get(id);
      if (!lead) return sendJson(res, 404, { error: 'Lead not found' });

      let audit = [];
      try { audit = JSON.parse(lead.audit_history || '[]'); } catch (e) {}
      audit.push({
        timestamp: now,
        author: user,
        action: 'SITE_MARKED_LIVE',
        details: `Catalogue marked live at ${liveUrl}. Notes: ${notes || 'None'}`
      });

      db.prepare(`
        UPDATE leads
        SET pipeline_stage = 'WON',
            live_url = ?,
            next_action = 'Handover complete - live at ' || ?,
            audit_history = ?,
            updated_at = ?
        WHERE id = ?
      `).run(liveUrl, liveUrl, JSON.stringify(audit), now, id);

      db.prepare(`
        INSERT INTO activity_logs (id, user, action_type, lead_id, metadata, created_at)
        VALUES (?, ?, 'SITE_MARKED_LIVE', ?, ?, ?)
      `).run(`act_live_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`, user, id, JSON.stringify({ liveUrl, notes }), now);

      return sendJson(res, 200, {
        success: true,
        status: 'MARKED_LIVE',
        message: 'Catalogue marked live',
        liveUrl,
        lead: { id, live_url: liveUrl, pipeline_stage: 'WON' }
      });
    }

    // 4b-7. B2B Mobile Catalogue Management APIs
    if (method === 'GET' && pathname.startsWith('/api/catalogues/') && pathname.endsWith('/export')) {
      const token = pathname.replace('/api/catalogues/', '').replace('/export', '').trim();
      const cat = db.prepare('SELECT * FROM catalogues WHERE token = ? OR id = ?').get(token, token);
      if (!cat) return sendJson(res, 404, { error: 'Catalogue not found' });

      const catalogueData = {
        id: cat.id,
        token: cat.token,
        business_name: cat.business_name,
        tagline: cat.tagline,
        language: cat.language || 'EN',
        whatsapp_number: cat.whatsapp_number,
        phone: cat.phone,
        email: cat.email,
        address: cat.address,
        google_maps_url: cat.google_maps_url,
        products: JSON.parse(cat.products || '[]'),
        verified_badges: JSON.parse(cat.verified_badges || '[]'),
        meta_description: cat.meta_description,
        is_sample: Boolean(cat.is_sample)
      };

      const exportDir = path.join(__dirname, '../data/exports', `catalogue_${cat.token}`);
      exportCatalogueToDisk(catalogueData, exportDir);

      return sendJson(res, 200, {
        success: true,
        token: cat.token,
        export_dir: exportDir,
        files: ['index.html', 'style.css', 'catalogue-data.js', 'HANDOVER_CHECKLIST.md'],
        message: 'Static catalogue package exported successfully'
      });
    }

    if (method === 'GET' && pathname.startsWith('/api/catalogues/')) {
      const token = pathname.replace('/api/catalogues/', '').trim();
      const cat = db.prepare('SELECT * FROM catalogues WHERE token = ? OR id = ?').get(token, token);
      if (!cat) return sendJson(res, 404, { error: 'Catalogue not found' });

      // Strictly sanitize: NEVER leak internal lead fields (lead_score, notes, audit_history, stage, etc.)
      const sanitized = {
        id: cat.id,
        token: cat.token,
        lead_id: cat.lead_id,
        business_name: cat.business_name,
        tagline: cat.tagline,
        language: cat.language || 'EN',
        whatsapp_number: cat.whatsapp_number,
        phone: cat.phone,
        email: cat.email,
        address: cat.address,
        google_maps_url: cat.google_maps_url,
        products: JSON.parse(cat.products || '[]'),
        verified_badges: JSON.parse(cat.verified_badges || '[]'),
        meta_description: cat.meta_description,
        is_sample: Boolean(cat.is_sample),
        created_at: cat.created_at,
        updated_at: cat.updated_at,
        catalogue_url: `/catalogue/${cat.token}`
      };

      return sendJson(res, 200, { success: true, catalogue: sanitized });
    }

    if (method === 'POST' && pathname === '/api/catalogues') {
      const body = await parseJsonBody(req);
      if (!body.business_name || !body.business_name.trim()) {
        return sendJson(res, 400, { error: 'Business name is required' });
      }
      if (!body.whatsapp_number || !body.whatsapp_number.trim()) {
        return sendJson(res, 400, { error: 'WhatsApp phone number is required' });
      }

      const user = req.headers['x-user-role'] || 'admin';
      const now = new Date().toISOString();
      
      // Validate products (enforce image size limits, alt text requirement)
      const products = Array.isArray(body.products) ? body.products : [];
      for (const p of products) {
        if (p.image_url && p.image_url.startsWith('data:') && p.image_url.length > 2.8 * 1024 * 1024) {
          return sendJson(res, 400, { error: `Product "${p.name || 'Item'}" image exceeds 2MB limit. Please compress before uploading.` });
        }
        if (p.image_url && (!p.alt_text || !p.alt_text.trim())) {
          p.alt_text = `${p.name || 'Product'} photo`;
        }
      }

      let catId = body.id;
      let token = body.token;
      let existing = null;

      if (token) {
        existing = db.prepare('SELECT * FROM catalogues WHERE token = ?').get(token);
      } else if (catId) {
        existing = db.prepare('SELECT * FROM catalogues WHERE id = ?').get(catId);
      } else if (body.lead_id) {
        existing = db.prepare('SELECT * FROM catalogues WHERE lead_id = ?').get(body.lead_id);
      }

      if (existing) {
        token = existing.token;
        catId = existing.id;
        db.prepare(`
          UPDATE catalogues
          SET business_name = ?,
              tagline = ?,
              language = ?,
              whatsapp_number = ?,
              phone = ?,
              email = ?,
              address = ?,
              google_maps_url = ?,
              products = ?,
              verified_badges = ?,
              meta_description = ?,
              is_sample = ?,
              updated_at = ?
          WHERE id = ?
        `).run(
          body.business_name.trim(),
          body.tagline || '',
          body.language || 'EN',
          body.whatsapp_number.trim(),
          body.phone || body.whatsapp_number.trim(),
          body.email || '',
          body.address || '',
          body.google_maps_url || '',
          JSON.stringify(products),
          JSON.stringify(body.verified_badges || []),
          body.meta_description || '',
          body.is_sample ? 1 : 0,
          now,
          catId
        );
      } else {
        catId = `cat_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        token = `cat_${crypto.randomBytes(8).toString('hex')}`;
        db.prepare(`
          INSERT INTO catalogues (
            id, lead_id, token, business_name, tagline, language,
            whatsapp_number, phone, email, address, google_maps_url,
            products, verified_badges, meta_description, is_sample,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          catId,
          body.lead_id || null,
          token,
          body.business_name.trim(),
          body.tagline || '',
          body.language || 'EN',
          body.whatsapp_number.trim(),
          body.phone || body.whatsapp_number.trim(),
          body.email || '',
          body.address || '',
          body.google_maps_url || '',
          JSON.stringify(products),
          JSON.stringify(body.verified_badges || []),
          body.meta_description || '',
          body.is_sample ? 1 : 0,
          now,
          now
        );
      }

      // If associated with a lead, update lead's live_url
      if (body.lead_id) {
        const liveUrl = `/catalogue/${token}`;
        db.prepare('UPDATE leads SET live_url = ?, updated_at = ? WHERE id = ?').run(liveUrl, now, body.lead_id);
      }

      // Log to activity_logs
      try {
        db.prepare(`
          INSERT INTO activity_logs (id, user, action_type, lead_id, metadata, created_at)
          VALUES (?, ?, 'CATALOGUE_SAVED', ?, ?, ?)
        `).run(
          `act_cat_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
          user,
          body.lead_id || null,
          JSON.stringify({ catalogue_id: catId, token, business_name: body.business_name }),
          now
        );
      } catch {}

      const saved = db.prepare('SELECT * FROM catalogues WHERE id = ?').get(catId);
      const sanitized = {
        id: saved.id,
        token: saved.token,
        lead_id: saved.lead_id,
        business_name: saved.business_name,
        tagline: saved.tagline,
        language: saved.language,
        whatsapp_number: saved.whatsapp_number,
        phone: saved.phone,
        email: saved.email,
        address: saved.address,
        google_maps_url: saved.google_maps_url,
        products: JSON.parse(saved.products || '[]'),
        verified_badges: JSON.parse(saved.verified_badges || '[]'),
        meta_description: saved.meta_description,
        is_sample: Boolean(saved.is_sample),
        created_at: saved.created_at,
        updated_at: saved.updated_at,
        catalogue_url: `/catalogue/${saved.token}`
      };

      return sendJson(res, 201, { success: true, catalogue: sanitized });
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
      const advanceAmount = body.advanceAmount || 2000;
      const paymentRef = body.paymentRef || `UPI_ADV_${Date.now().toString().slice(-6)}`;
      const note = body.note || `Deal closed. Advance token ₹${advanceAmount} received via ${paymentRef}. Handed over for B2B mobile catalogue deployment.`;

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

      // Exclude demo leads by default
      if (q.include_demo !== 'true') {
        whereClauses.push('COALESCE(is_demo, 0) = 0');
      }

      // Exclude opted-out / suppression list records
      whereClauses.push(`id NOT IN (
        SELECT l2.id FROM leads l2
        JOIN suppression_list s ON (l2.normalized_phone = s.identifier_val OR l2.phone = s.identifier_val OR l2.normalized_domain = s.identifier_val)
      )`);

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

      db.prepare(`
        INSERT INTO activity_logs (id, user, action_type, lead_id, metadata, created_at)
        VALUES (?, ?, 'OUTREACH_APPROVED', ?, ?, ?)
      `).run(`act_appr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`, 'Admin', leadId, JSON.stringify({ approvedStage: 'APPROVED_FOR_CONTACT' }), now);

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

    // 15. Reports & Financial Command Deck API
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

      // Live Financial Velocity & Cashflow Metrics
      const totalLeads = db.prepare('SELECT COUNT(*) as c FROM leads').get().c;
      const wonLeads = db.prepare("SELECT id, business_name, city, state, pipeline_stage, updated_at FROM leads WHERE pipeline_stage = 'WON'").all();
      const demoLeads = db.prepare("SELECT id, business_name, city, state, pipeline_stage, updated_at FROM leads WHERE pipeline_stage = 'MEETING_BOOKED'").all();
      const repliedLeads = db.prepare("SELECT id, business_name, city, state, pipeline_stage, updated_at FROM leads WHERE pipeline_stage = 'REPLIED'").all();
      const contactedLeads = db.prepare("SELECT id, business_name, city, state, pipeline_stage, updated_at FROM leads WHERE pipeline_stage = 'CONTACTED'").all();

      const advanceCash = wonLeads.length * 2000;
      const receivablesDue = wonLeads.length * 3999;
      const totalAddressablePipeline = totalLeads * 7999;
      const weighted30Day = Math.round(
        (wonLeads.length * 5999 * 1.0) +
        (demoLeads.length * 5999 * 0.60) +
        (repliedLeads.length * 5999 * 0.35) +
        (contactedLeads.length * 7999 * 0.15)
      );

      const dealLedger = [
        ...wonLeads.map(l => ({ ...l, dealValue: 5999, advancePaid: 2000, balanceDue: 3999, status: 'ADVANCE_LOCKED' })),
        ...demoLeads.map(l => ({ ...l, dealValue: 5999, advancePaid: 0, balanceDue: 5999, status: 'DEMO_STAGED' })),
        ...repliedLeads.map(l => ({ ...l, dealValue: 5999, advancePaid: 0, balanceDue: 5999, status: 'IN_NEGOTIATION' })),
        ...contactedLeads.map(l => ({ ...l, dealValue: 7999, advancePaid: 0, balanceDue: 7999, status: 'PITCH_DELIVERED' }))
      ];

      const financialMetrics = {
        totalLeads,
        packagePrice: 7999,
        foundingPrice: 5999,
        advancePrice: 2000,
        balancePrice: 3999,
        advanceCash,
        receivablesDue,
        totalAddressablePipeline,
        weighted30Day,
        grossMarginPct: 88.9,
        cacInr: 0,
        dealLedger
      };

      return sendJson(res, 200, {
        sourceQuality,
        regionMetrics,
        serviceRevenue,
        financialMetrics
      });
    }

    // 16. Proforma Invoice & Receipt Generator API
    if (method === 'GET' && pathname.startsWith('/api/leads/') && pathname.endsWith('/invoice')) {
      const id = pathname.replace('/api/leads/', '').replace('/invoice', '');
      const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
      if (!lead) return sendJson(res, 404, { error: 'Lead not found' });

      const isWon = lead.pipeline_stage === 'WON';
      const invoiceData = {
        invoiceNumber: `INDUS-${id.slice(-4).toUpperCase()}`,
        date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        businessName: lead.business_name,
        city: lead.city,
        state: lead.state,
        phone: lead.phone || 'Phone upon request',
        items: [
          { desc: 'Mobile-Friendly B2B Product Catalogue Site', amount: 3999 },
          { desc: 'Direct WhatsApp Enquiry Integration & Instant Lead Routing', amount: 2000 },
          { desc: 'Google Business Profile Setup & Local Discovery Verification', amount: 2000 }
        ],
        subtotal: 7999,
        foundingDiscount: 2000,
        totalAmount: 5999,
        advancePaid: isWon ? 2000 : 0,
        balanceDue: isWon ? 3999 : 5999,
        paymentStatus: isWon ? 'ADVANCE_LOCKED' : 'PROFORMA_PENDING',
        upiId: 'bharatgrowth@icici',
        upiPayLink: `upi://pay?pa=bharatgrowth@icici&pn=BharatGrowth%20AI&am=2000&cu=INR&tn=Advance%20${encodeURIComponent(lead.business_name)}`
      };

      return sendJson(res, 200, { success: true, invoice: invoiceData });
    }

    // 17. Lead Digital Audit Report API
    if (method === 'GET' && pathname.startsWith('/api/leads/') && pathname.endsWith('/audit-report')) {
      const id = pathname.replace('/api/leads/', '').replace('/audit-report', '');
      const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
      if (!lead) return sendJson(res, 404, { error: 'Lead not found' });

      const hasWeb = lead.website_status !== 'NO_WEBSITE_FOUND' && lead.website_url;
      const isSecured = hasWeb && lead.website_url.startsWith('https://');

      const auditData = {
        leadId: lead.id,
        businessName: lead.business_name,
        city: lead.city,
        state: lead.state,
        subcategory: lead.subcategory || 'Textile & Manufacturing',
        phone: lead.phone || 'Upon Request',
        digitalScore: lead.lead_score,
        auditDate: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        findings: [
          {
            parameter: 'Online Website & B2B Catalogue',
            status: hasWeb ? 'ACTIVE_UNOPTIMIZED' : 'CRITICAL_MISSING',
            passed: Boolean(hasWeb),
            impact: hasWeb ? 'Outdated presentation lacks instant wholesale catalogue' : 'Wholesale buyers in Delhi/Mumbai cannot view current designs or place inquiries'
          },
          {
            parameter: 'SSL Data Security & Encryption',
            status: isSecured ? 'SECURED' : 'SECURITY_RISK',
            passed: Boolean(isSecured),
            impact: isSecured ? 'Standard SSL active' : 'Browsers flag site as "Not Secure", causing dealers to abandon orders'
          },
          {
            parameter: 'Mobile & Smartphone Viewport',
            status: hasWeb ? 'PARTIAL' : 'NON_COMPLIANT',
            passed: false,
            impact: 'Outstation B2B buyers browse and check product ranges on mobile phones; non-mobile pages cause buyers to look elsewhere'
          },
          {
            parameter: 'Instant WhatsApp Commerce Ordering',
            status: 'MISSING',
            passed: false,
            impact: 'Dealers forced to phone or wait for manual WhatsApp photos; high friction during peak business hours'
          }
        ],
        businessLossEstimate: {
          monthlyInquiriesLost: 'Outstation Inquiries Lost to Competitors',
          weeklyWastedStaffHours: 'Staff time spent manually sharing photos on WhatsApp',
          estimatedRevenueLeakage: 'Missing Google & Mobile Discovery'
        },
        recommendedSolution: 'B2B Mobile Catalogue + WhatsApp Enquiry Button + Google Business Profile Setup',
        packageCost: 7999,
        foundingCost: 5999,
        tokenAdvance: 2000,
        balanceDue: 3999,
        portalUrl: `/portal/${lead.id}`,
        shareableText: `*DIGITAL MATURITY & BUYER ENQUIRY AUDIT*\nEnterprise: *${lead.business_name}* (${lead.city})\nScore: *${lead.lead_score}/100*\n\nKey Gaps Identified:\n• Online Catalogue: ${hasWeb ? 'Outdated' : 'Missing (Zero discoverability for outstation buyers)'}\n• WhatsApp Direct Enquiry: Missing (Manual photo sharing friction)\n• Google Profile: Needs Optimization\n\nCore Offer: Mobile B2B Catalogue + WhatsApp Button + Google Profile Setup.\nFounding Rate: ₹5,999 (₹2,000 advance). Inspect sample demo: http://localhost:3000/portal/${lead.id}`
      };

      return sendJson(res, 200, { success: true, audit: auditData });
    }

    // -------------------------------------------------------------
    // STATIC FILE & PORTAL ROUTING
    // -------------------------------------------------------------
    if (pathname.startsWith('/catalogue/')) {
      const token = pathname.replace('/catalogue/', '').trim();
      const cat = db.prepare('SELECT * FROM catalogues WHERE token = ? OR id = ?').get(token, token);
      if (!cat) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end('<!DOCTYPE html><html><head><title>Catalogue Not Found</title></head><body style="font-family:sans-serif;text-align:center;padding:50px;"><h2>Catalogue Not Found</h2><p>The requested B2B product catalogue does not exist or has expired.</p></body></html>');
      }

      const catalogueData = {
        id: cat.id,
        token: cat.token,
        business_name: cat.business_name,
        tagline: cat.tagline,
        language: cat.language || 'EN',
        whatsapp_number: cat.whatsapp_number,
        phone: cat.phone,
        email: cat.email,
        address: cat.address,
        google_maps_url: cat.google_maps_url,
        products: JSON.parse(cat.products || '[]'),
        verified_badges: JSON.parse(cat.verified_badges || '[]'),
        meta_description: cat.meta_description,
        is_sample: Boolean(cat.is_sample)
      };

      const html = generateCatalogueHtml(catalogueData);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }

    if (pathname.startsWith('/portal/')) {
      const portalPath = path.join(PUBLIC_DIR, 'portal.html');
      return fs.readFile(portalPath, (err, content) => {
        if (err) {
          res.writeHead(404);
          return res.end('Portal template not found');
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(content);
      });
    }

    if (pathname.startsWith('/audit/')) {
      const auditHtmlPath = path.join(PUBLIC_DIR, 'audit.html');
      return fs.readFile(auditHtmlPath, (err, content) => {
        if (err) {
          res.writeHead(404);
          return res.end('Audit template not found');
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(content);
      });
    }

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
