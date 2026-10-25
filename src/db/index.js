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
  } catch (err) {
    console.error("Migration check:", err.message);
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
