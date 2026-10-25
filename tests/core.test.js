// tests/core.test.js - Unit tests for BharatGrowth AI Core Engines
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

// Use a temporary in-memory or scratch SQLite db for test isolation
const TEST_DB_PATH = path.join(__dirname, '../data/test_msme.sqlite');
process.env.DB_PATH = TEST_DB_PATH;

const { getDb, closeDb } = require('../src/db/index.js');
const {
  normalizeIndianPhone,
  normalizePincode,
  normalizeBusinessName,
  normalizeDomain,
  categorizeIndustry,
  INDIAN_STATES_AND_UTS
} = require('../src/core/taxonomy.js');
const { tokenJaccardSimilarity, findDuplicateInDb, checkSuppression } = require('../src/core/deduplication.js');
const { calculateLeadScore } = require('../src/core/scoring.js');
const { generateSalesBrief } = require('../src/core/sales_intelligence.js');
const { parseCsvContent } = require('../src/sources/csv_adapter.js');
const { processCandidateLead, runBatchDiscoveryJob } = require('../src/core/operations_manager.js');

test('Taxonomy: Phone, Pincode, and Name normalization', () => {
  // Phone tests
  assert.strictEqual(normalizeIndianPhone('+91 98250 12344'), '9825012344');
  assert.strictEqual(normalizeIndianPhone('0261-2634912'), '2612634912');
  assert.strictEqual(normalizeIndianPhone('919814055621'), '9814055621');
  assert.strictEqual(normalizeIndianPhone('123'), null); // Invalid length

  // Pincode tests
  assert.strictEqual(normalizePincode('395002'), '395002');
  assert.strictEqual(normalizePincode('095002'), null); // Starts with 0
  assert.strictEqual(normalizePincode('39500'), null); // Only 5 digits

  // Business Name normalization
  const norm = normalizeBusinessName('Shree Ambica Weaving Mills Pvt. Ltd. & Co.');
  assert.strictEqual(norm, 'shree ambica weaving');

  // Domain normalization
  assert.strictEqual(normalizeDomain('https://www.ambicaweaving.in/catalog/'), 'ambicaweaving.in');
  assert.strictEqual(normalizeDomain('http://karpagamknits.com'), 'karpagamknits.com');

  // Category heuristics
  const catTextile = categorizeIndustry('Jacquard Saree Weaving Factory');
  assert.strictEqual(catTextile.category, 'D');

  const catFood = categorizeIndustry('Organic Spices and Masala Packaging');
  assert.strictEqual(catFood.category, 'C');

  // Verify all 28 states and 8 UTs are covered
  assert.strictEqual(INDIAN_STATES_AND_UTS.length, 36);
});

test('Deduplication: Token Jaccard similarity', () => {
  const simIdentical = tokenJaccardSimilarity('balaji textiles', 'balaji textiles');
  assert.strictEqual(simIdentical, 1.0);

  const simHigh = tokenJaccardSimilarity('shree balaji textiles', 'balaji textiles');
  assert.ok(simHigh >= 0.66);

  const simDifferent = tokenJaccardSimilarity('rajkot diesel engines', 'shree balaji textiles');
  assert.strictEqual(simDifferent, 0.0);
});

test('Scoring: 100-point transparent scoring engine', () => {
  const leadSample = {
    business_name: 'Apex Hydraulics Pune',
    industry_category: 'F', // Auto parts / Engineering
    entity_type: 'MANUFACTURER',
    msme_tier: 'SMALL',
    city: 'Pune',
    state: 'Maharashtra',
    pincode: '411026',
    phone: '02027129845',
    normalized_phone: '2027129845',
    email: 'sales@apexhydraulics.in',
    website: '',
    website_status: 'NO_WEBSITE_FOUND',
    last_verification_date: new Date().toISOString(),
    evidence: [{ timestamp: new Date().toISOString(), rawEvidence: 'Sample' }],
    digital_assessment: { hasWebsite: false }
  };

  const score = calculateLeadScore(leadSample, {
    weight_digital_need: 30,
    weight_commercial_fit: 25,
    weight_contactability: 20,
    weight_evidence_freshness: 15,
    weight_geo_fit: 10
  });

  assert.ok(score.total >= 70, `Expected score >= 70 for strong industrial lead without website, got ${score.total}`);
  assert.strictEqual(score.queue, 'HIGH');
  assert.ok(score.digitalNeed.score > 0);
  assert.ok(score.commercialFit.score > 0);
  assert.ok(score.contactability.score > 0);
});

test('Sales Intelligence: Multilingual brief generation', () => {
  const leadSample = {
    business_name: 'Shree Ambica Weaving Mills',
    industry_category: 'D',
    subcategory: 'Woven Fabrics',
    entity_type: 'MANUFACTURER',
    city: 'Surat',
    state: 'Gujarat',
    phone: '9825012344',
    website_status: 'NO_WEBSITE_FOUND',
    digital_assessment: { observableNeeds: ['Missing official mobile catalogue'] }
  };

  const brief = generateSalesBrief(leadSample);
  assert.ok(brief.business_summary.includes('Shree Ambica Weaving Mills'));
  assert.ok(brief.outreach_email_en.includes('Surat'));
  assert.ok(brief.outreach_email_hi.includes('नमस्ते'));
  assert.ok(brief.introductory_offer.includes('₹'));
  assert.ok(brief.verification_checklist.includes('[Hypothesis to verify]'));
});

test('CSV Parser: Auto-mapping Indian column conventions', async () => {
  const csvData = `Firm Name,Contact No,Email ID,City,State,Nature of Business,Website
Shree Balaji Traders,9825011111,balaji@test.in,Ahmedabad,Gujarat,Textile Cotton Fabrics,
Krishna Engineering Works,0261-2223344,,Surat,Gujarat,Auto Components,http://krishnaengg.in`;

  const parsed = await parseCsvContent(csvData, 'Test Upload');
  assert.strictEqual(parsed.success, true);
  assert.strictEqual(parsed.importedCount, 2);
  assert.strictEqual(parsed.leads[0].business_name, 'Shree Balaji Traders');
  assert.strictEqual(parsed.leads[0].city, 'Ahmedabad');
  assert.strictEqual(parsed.leads[1].business_name, 'Krishna Engineering Works');
});

test('Database & Pipeline: Full candidate ingestion, deduplication and batch discovery', async () => {
  // Clean test DB if exists
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }

  const db = getDb();
  assert.ok(db);

  // 1. Ingest candidate lead
  const candidate = {
    business_name: 'Bharat Metal Works',
    industry_category: 'A',
    subcategory: 'Industrial Fabrications',
    entity_type: 'MANUFACTURER',
    city: 'Faridabad',
    state: 'Haryana',
    pincode: '121006',
    address: 'Plot 10, Sector 24, Faridabad',
    phone: '9899120980',
    website: '',
    source_name: 'Test Source',
    source_record_id: 'test_001'
  };

  const res1 = await processCandidateLead(db, candidate, {});
  assert.strictEqual(res1.status, 'INGESTED_SUCCESS');
  assert.ok(res1.leadId);

  // 2. Test duplicate rejection on phone match
  const dupCandidate = {
    business_name: 'Bharat Metal Works Ancillary',
    phone: '9899120980', // Same phone
    city: 'Faridabad',
    source_name: 'Test Source 2'
  };
  const res2 = await processCandidateLead(db, dupCandidate, {});
  assert.strictEqual(res2.status, 'SKIPPED_DUPLICATE');

  // 3. Run batch discovery job
  const batchRes = await runBatchDiscoveryJob('Surat', 'Gujarat', 'D');
  assert.strictEqual(batchRes.success, true);
  assert.ok(batchRes.totalFound > 0);

  // Check database count
  const leadCount = db.prepare('SELECT COUNT(*) as count FROM leads').get().count;
  assert.ok(leadCount >= 2, `Expected at least 2 leads in DB, found ${leadCount}`);

  // Check sales briefs populated
  const briefCount = db.prepare('SELECT COUNT(*) as count FROM sales_briefs').get().count;
  assert.ok(briefCount >= 1, `Expected sales briefs generated, found ${briefCount}`);

  closeDb();
});
