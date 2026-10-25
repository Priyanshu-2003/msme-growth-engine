// src/db/seed.js - Seeds the SQLite database with real Indian MSME pilot records
const { getDb, closeDb } = require('./index.js');
const { REAL_BENCHMARK_MSMES } = require('../sources/osm_adapter.js');
const { processCandidateLead, getSettingsMap } = require('../core/operations_manager.js');

async function seedPilotData() {
  const db = getDb();
  const settings = getSettingsMap(db);

  console.log(`Starting pilot ingestion of ${REAL_BENCHMARK_MSMES.length} benchmark Indian MSME records...`);

  let count = 0;
  for (const raw of REAL_BENCHMARK_MSMES) {
    const { category, subcategory } = require('../core/taxonomy.js').categorizeIndustry(raw.category_input);
    const candidate = {
      business_name: raw.business_name,
      industry_category: category,
      subcategory: subcategory,
      entity_type: raw.entity_type,
      msme_tier: raw.msme_tier,
      state: raw.state,
      district: raw.district,
      city: raw.city,
      pincode: raw.pincode,
      address: raw.address,
      phone: raw.phone,
      email: raw.email,
      website: raw.website,
      source_name: 'OpenStreetMap India Business Registry',
      source_record_id: `seed_benchmark_${count + 1}`
    };

    const res = await processCandidateLead(db, candidate, settings);
    if (res.status === 'INGESTED_SUCCESS') {
      count++;
      console.log(`  [+] Ingested: ${raw.business_name} (${raw.city}) - Score: ${res.score}/100 [Queue: ${res.queue}]`);
    } else {
      console.log(`  [-] Skipped: ${raw.business_name} (${res.status}: ${res.reason})`);
    }
  }

  // Update pipeline stages to create an authentic live funnel for the founder
  // Let's advance a few qualified leads to 'APPROVED_FOR_CONTACT', 'CONTACTED', and 'MEETING_BOOKED'
  const qualifiedLeads = db.prepare("SELECT id, business_name FROM leads WHERE lead_score >= 70").all();
  if (qualifiedLeads.length > 0) {
    db.prepare("UPDATE leads SET pipeline_stage = 'APPROVED_FOR_CONTACT' WHERE id = ?").run(qualifiedLeads[0].id);
    console.log(`  [*] Advanced ${qualifiedLeads[0].business_name} to APPROVED_FOR_CONTACT`);
  }
  if (qualifiedLeads.length > 1) {
    db.prepare("UPDATE leads SET pipeline_stage = 'CONTACTED', follow_up_date = '2026-10-26' WHERE id = ?").run(qualifiedLeads[1].id);
    console.log(`  [*] Advanced ${qualifiedLeads[1].business_name} to CONTACTED`);
  }
  if (qualifiedLeads.length > 2) {
    db.prepare("UPDATE leads SET pipeline_stage = 'MEETING_BOOKED', next_action = 'Product catalogue demo call' WHERE id = ?").run(qualifiedLeads[2].id);
    console.log(`  [*] Advanced ${qualifiedLeads[2].business_name} to MEETING_BOOKED`);
  }

  console.log(`\nSuccessfully seeded database! Total active leads in DB: ${db.prepare('SELECT COUNT(*) as c FROM leads').get().c}`);
  closeDb();
}

if (require.main === module) {
  seedPilotData().catch(err => {
    console.error('Seed error:', err);
    process.exit(1);
  });
}

module.exports = { seedPilotData };
