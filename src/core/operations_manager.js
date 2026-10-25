// src/core/operations_manager.js - Autonomous Discovery, Enrichment, Scoring & Ingestion Pipeline
const crypto = require('node:crypto');
const { getDb } = require('../db/index.js');
const {
  normalizeIndianPhone,
  normalizeBusinessName,
  normalizeDomain,
  normalizePincode
} = require('./taxonomy.js');
const { findDuplicateInDb, checkSuppression } = require('./deduplication.js');
const { calculateLeadScore } = require('./scoring.js');
const { assessDigitalPresence } = require('./website_checker.js');
const { generateSalesBrief } = require('./sales_intelligence.js');

/**
 * Loads dynamic settings from database
 */
function getSettingsMap(db) {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const map = {};
  for (const r of rows) {
    try {
      map[r.key] = JSON.parse(r.value);
    } catch {
      map[r.key] = r.value;
    }
  }
  return map;
}

/**
 * Ingests a single raw lead candidate through the full 12-step pipeline
 */
async function processCandidateLead(db, candidate, settings) {
  const now = new Date().toISOString();

  // 1. Check suppression list (opt-outs)
  const suppCheck = checkSuppression(db, candidate);
  if (suppCheck.isSuppressed) {
    return {
      status: 'BLOCKED_SUPPRESSION',
      reason: suppCheck.reason,
      leadId: null
    };
  }

  // 2. Normalization
  const normName = normalizeBusinessName(candidate.business_name);
  const normPhone = normalizeIndianPhone(candidate.phone);
  const normDomain = normalizeDomain(candidate.website);
  const normPincode = normalizePincode(candidate.pincode);

  if (!normName) {
    return {
      status: 'SKIPPED_INVALID_NAME',
      reason: 'Empty or unparseable business name',
      leadId: null
    };
  }

  // 3. Deduplication against existing database
  const dupCheck = findDuplicateInDb(db, {
    business_name: candidate.business_name,
    phone: candidate.phone,
    website: candidate.website,
    city: candidate.city
  });

  if (dupCheck.isDuplicate) {
    return {
      status: 'SKIPPED_DUPLICATE',
      reason: dupCheck.matchReason,
      matchedLeadId: dupCheck.matchedLead.id
    };
  }

  // 4. Initial Evidence Trail
  const initialEvidence = [
    {
      timestamp: now,
      checkType: 'INITIAL_INGESTION',
      source: candidate.source_name,
      rawEvidence: `Discovered from ${candidate.source_name} (ID: ${candidate.source_record_id || 'N/A'})`,
      note: 'Ingested into pipeline for verification'
    }
  ];

  // 5. Digital Presence Assessment & Website Verification
  const partialLeadForAssessment = {
    website: candidate.website,
    source_name: candidate.source_name,
    evidence: initialEvidence
  };
  const webAssessment = await assessDigitalPresence(partialLeadForAssessment);

  // 6. Assemble candidate object for scoring
  const leadId = `lead_${crypto.randomBytes(6).toString('hex')}`;
  const leadRecord = {
    id: leadId,
    business_name: candidate.business_name,
    normalized_name: normName,
    industry_category: candidate.industry_category || 'Q',
    subcategory: candidate.subcategory || 'General MSME',
    msme_tier: candidate.msme_tier || 'UNKNOWN',
    entity_type: candidate.entity_type || 'UNKNOWN',
    state: candidate.state || 'India',
    district: candidate.district || null,
    city: candidate.city || 'Unknown',
    pincode: normPincode,
    address: candidate.address || null,
    phone: candidate.phone || null,
    normalized_phone: normPhone,
    email: candidate.email || null,
    website: candidate.website || null,
    normalized_domain: normDomain,
    listing_url: candidate.listing_url || null,
    social_profiles: JSON.stringify(webAssessment.digital_assessment.socialProfiles || []),
    source_name: candidate.source_name,
    source_record_id: candidate.source_record_id || null,
    discovery_date: now,
    last_verification_date: webAssessment.last_verification_date,
    website_status: webAssessment.website_status,
    digital_assessment: webAssessment.digital_assessment,
    evidence: webAssessment.evidence,
    verification_status: normPhone ? 'VERIFIED_ACTIVE' : 'UNVERIFIED',
    inventory_profile: JSON.stringify(candidate.inventory_profile || {}),
    buying_signal: candidate.buying_signal || null,
    maps_rating: candidate.maps_rating || null,
    reviews_count: candidate.reviews_count || 0
  };

  // 7. Calculate 100-point transparent score
  const scoreBreakdown = calculateLeadScore(leadRecord, settings);
  leadRecord.lead_score = scoreBreakdown.total;
  leadRecord.opportunity_tier = scoreBreakdown.queue === 'HIGH' ? 'TIER_1_HIGH' : (scoreBreakdown.queue === 'MEDIUM' ? 'TIER_2_MEDIUM' : 'TIER_3_LOW');

  // Pipeline stage based on qualification
  let pipelineStage = 'DISCOVERED';
  if (leadRecord.lead_score >= 60) {
    pipelineStage = 'QUALIFIED';
  } else {
    pipelineStage = 'RESEARCHED';
  }

  // 8. Generate AI Sales Brief for High/Medium Priority Leads
  let salesBrief = null;
  if (scoreBreakdown.queue === 'HIGH' || scoreBreakdown.queue === 'MEDIUM') {
    salesBrief = generateSalesBrief(leadRecord);
    leadRecord.services_needed = [salesBrief.primary_service_offer];
  } else {
    leadRecord.services_needed = ['General digital assessment'];
  }

  // 9. Persist Lead to Database
  const insertLeadStmt = db.prepare(`
    INSERT INTO leads (
      id, business_name, normalized_name, industry_category, subcategory,
      msme_tier, entity_type, state, district, city, pincode, address,
      phone, normalized_phone, email, website, normalized_domain, listing_url,
      social_profiles, source_name, source_record_id, discovery_date,
      last_verification_date, website_status, digital_assessment, evidence,
      services_needed, opportunity_tier, lead_score, score_breakdown,
      verification_status, pipeline_stage, assigned_owner, next_action,
      notes, audit_history, inventory_profile, buying_signal, maps_rating, reviews_count,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?
    )
  `);

  insertLeadStmt.run(
    leadRecord.id,
    leadRecord.business_name,
    leadRecord.normalized_name,
    leadRecord.industry_category,
    leadRecord.subcategory,
    leadRecord.msme_tier,
    leadRecord.entity_type,
    leadRecord.state,
    leadRecord.district,
    leadRecord.city,
    leadRecord.pincode,
    leadRecord.address,
    leadRecord.phone,
    leadRecord.normalized_phone,
    leadRecord.email,
    leadRecord.website,
    leadRecord.normalized_domain,
    leadRecord.listing_url,
    leadRecord.social_profiles,
    leadRecord.source_name,
    leadRecord.source_record_id,
    leadRecord.discovery_date,
    leadRecord.last_verification_date,
    leadRecord.website_status,
    JSON.stringify(leadRecord.digital_assessment),
    JSON.stringify(leadRecord.evidence),
    JSON.stringify(leadRecord.services_needed),
    leadRecord.opportunity_tier,
    leadRecord.lead_score,
    JSON.stringify(scoreBreakdown),
    leadRecord.verification_status,
    pipelineStage,
    'Unassigned',
    scoreBreakdown.queue === 'HIGH' ? 'Review sales brief and outreach draft' : 'Monitor cluster',
    JSON.stringify([]),
    JSON.stringify([{ timestamp: now, action: 'DISCOVERED_AND_SCORED', details: `Score: ${leadRecord.lead_score}/100, Queue: ${scoreBreakdown.queue}` }]),
    leadRecord.inventory_profile,
    leadRecord.buying_signal,
    leadRecord.maps_rating,
    leadRecord.reviews_count,
    now,
    now
  );

  // 10. Persist Sales Brief if generated
  if (salesBrief) {
    const briefId = `brief_${crypto.randomBytes(6).toString('hex')}`;
    const insertBriefStmt = db.prepare(`
      INSERT INTO sales_briefs (
        id, lead_id, business_summary, online_presence_evidence,
        key_observable_opportunity, primary_service_offer, why_relevant,
        introductory_offer, outreach_email_en, outreach_whatsapp_en,
        outreach_call_script_en, outreach_email_hi, outreach_whatsapp_hi,
        outreach_call_script_hi, verification_checklist, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertBriefStmt.run(
      briefId,
      leadRecord.id,
      salesBrief.business_summary,
      salesBrief.online_presence_evidence,
      salesBrief.key_observable_opportunity,
      salesBrief.primary_service_offer,
      salesBrief.why_relevant,
      salesBrief.introductory_offer,
      salesBrief.outreach_email_en,
      salesBrief.outreach_whatsapp_en,
      salesBrief.outreach_call_script_en,
      salesBrief.outreach_email_hi,
      salesBrief.outreach_whatsapp_hi,
      salesBrief.outreach_call_script_hi,
      salesBrief.verification_checklist,
      now
    );
  }

  return {
    status: 'INGESTED_SUCCESS',
    leadId: leadRecord.id,
    business_name: leadRecord.business_name,
    score: leadRecord.lead_score,
    queue: scoreBreakdown.queue,
    pipelineStage
  };
}

/**
 * Executes a batch discovery & ingestion job
 */
async function runBatchDiscoveryJob(city = 'Surat', state = 'Gujarat', category = 'A', count = 20) {
  const db = getDb();
  const settings = getSettingsMap(db);
  const now = new Date().toISOString();
  const jobId = `job_${crypto.randomBytes(6).toString('hex')}`;

  // Log job start
  db.prepare(`
    INSERT INTO discovery_jobs (
      id, state, district, industry_category, source_name,
      status, total_found, total_qualified, duplicates_skipped,
      error_message, started_at
    ) VALUES (?, ?, ?, ?, ?, 'RUNNING', 0, 0, 0, NULL, ?)
  `).run(jobId, state, city, category, 'Pan-India Industrial Registry', now);

  try {
    const { discoverOsmMsmes } = require('../sources/osm_adapter.js');
    const discoveryResult = await discoverOsmMsmes(city, category, state, count);

    let totalFound = discoveryResult.leads.length;
    let totalQualified = 0;
    let duplicatesSkipped = 0;

    for (const candidate of discoveryResult.leads) {
      const res = await processCandidateLead(db, candidate, settings);
      if (res.status === 'INGESTED_SUCCESS') {
        if (res.pipelineStage === 'QUALIFIED' || res.queue === 'HIGH') {
          totalQualified++;
        }
      } else if (res.status === 'SKIPPED_DUPLICATE') {
        duplicatesSkipped++;
      }
    }

    const completedAt = new Date().toISOString();
    db.prepare(`
      UPDATE discovery_jobs
      SET status = 'COMPLETED',
          total_found = ?,
          total_qualified = ?,
          duplicates_skipped = ?,
          completed_at = ?
      WHERE id = ?
    `).run(totalFound, totalQualified, duplicatesSkipped, completedAt, jobId);

    return {
      success: true,
      jobId,
      totalFound,
      totalQualified,
      duplicatesSkipped
    };
  } catch (err) {
    const failedAt = new Date().toISOString();
    db.prepare(`
      UPDATE discovery_jobs
      SET status = 'FAILED',
          error_message = ?,
          completed_at = ?
      WHERE id = ?
    `).run(err.message, failedAt, jobId);

    return {
      success: false,
      jobId,
      error: err.message
    };
  }
}

module.exports = {
  getSettingsMap,
  processCandidateLead,
  runBatchDiscoveryJob
};
