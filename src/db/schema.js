// src/db/schema.js - SQLite schema definitions for BharatGrowth AI

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  business_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  industry_category TEXT NOT NULL,
  subcategory TEXT,
  msme_tier TEXT DEFAULT 'UNKNOWN',
  entity_type TEXT DEFAULT 'UNKNOWN',
  state TEXT NOT NULL,
  district TEXT,
  city TEXT NOT NULL,
  pincode TEXT,
  address TEXT,
  phone TEXT,
  normalized_phone TEXT,
  email TEXT,
  website TEXT,
  normalized_domain TEXT,
  listing_url TEXT,
  social_profiles TEXT DEFAULT '[]',
  source_name TEXT NOT NULL,
  source_record_id TEXT,
  discovery_date TEXT NOT NULL,
  last_verification_date TEXT,
  website_status TEXT NOT NULL DEFAULT 'INSUFFICIENT_EVIDENCE',
  digital_assessment TEXT DEFAULT '{}',
  evidence TEXT DEFAULT '[]',
  services_needed TEXT DEFAULT '[]',
  opportunity_tier TEXT DEFAULT 'TIER_2_MEDIUM',
  lead_score INTEGER DEFAULT 0,
  score_breakdown TEXT DEFAULT '{}',
  verification_status TEXT DEFAULT 'UNVERIFIED',
  pipeline_stage TEXT DEFAULT 'DISCOVERED',
  assigned_owner TEXT DEFAULT 'Unassigned',
  next_action TEXT,
  follow_up_date TEXT,
  notes TEXT DEFAULT '[]',
  audit_history TEXT DEFAULT '[]',
  inventory_profile TEXT DEFAULT '{}',
  buying_signal TEXT,
  maps_rating REAL,
  reviews_count INTEGER DEFAULT 0,
  retention_restrictions TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_leads_normalized_name ON leads(normalized_name);
CREATE INDEX IF NOT EXISTS idx_leads_normalized_phone ON leads(normalized_phone);
CREATE INDEX IF NOT EXISTS idx_leads_normalized_domain ON leads(normalized_domain);
CREATE INDEX IF NOT EXISTS idx_leads_state_city ON leads(state, city);
CREATE INDEX IF NOT EXISTS idx_leads_industry ON leads(industry_category);
CREATE INDEX IF NOT EXISTS idx_leads_website_status ON leads(website_status);
CREATE INDEX IF NOT EXISTS idx_leads_lead_score ON leads(lead_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_pipeline_stage ON leads(pipeline_stage);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  access_method TEXT NOT NULL,
  usage_restrictions TEXT NOT NULL,
  available_fields TEXT NOT NULL,
  freshness TEXT NOT NULL,
  coverage_limitations TEXT NOT NULL,
  cost_per_query REAL DEFAULT 0.0,
  rate_limit_per_min INTEGER DEFAULT 60,
  commercial_reuse_allowed INTEGER DEFAULT 1,
  is_active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS discovery_jobs (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  district TEXT,
  industry_category TEXT NOT NULL,
  source_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  total_found INTEGER DEFAULT 0,
  total_qualified INTEGER DEFAULT 0,
  duplicates_skipped INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TEXT,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS sales_briefs (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL UNIQUE,
  business_summary TEXT NOT NULL,
  online_presence_evidence TEXT NOT NULL,
  key_observable_opportunity TEXT NOT NULL,
  primary_service_offer TEXT NOT NULL,
  why_relevant TEXT NOT NULL,
  introductory_offer TEXT NOT NULL,
  outreach_email_en TEXT NOT NULL,
  outreach_whatsapp_en TEXT NOT NULL,
  outreach_call_script_en TEXT NOT NULL,
  outreach_email_hi TEXT NOT NULL,
  outreach_whatsapp_hi TEXT NOT NULL,
  outreach_call_script_hi TEXT NOT NULL,
  verification_checklist TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS suppression_list (
  id TEXT PRIMARY KEY,
  identifier_type TEXT NOT NULL, -- PHONE, EMAIL, DOMAIN, NAME
  identifier_val TEXT NOT NULL UNIQUE,
  business_name TEXT,
  opt_out_date TEXT NOT NULL,
  reason TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

module.exports = { SCHEMA_SQL };
