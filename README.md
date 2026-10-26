> ⚠️ **Security Notice: Do not deploy publicly until authentication is implemented (Phase 3).**

# BharatGrowth AI — India-Wide MSME Growth & Lead-Generation Engine

BharatGrowth AI is an intelligent B2B lead discovery, digital need assessment, and sales qualification platform engineered specifically for the Indian MSME ecosystem across all 28 states and 8 union territories.

---

## 🚀 Key Features

1. **India-Wide Discovery Engine**:
   - Covers all 28 Indian States & 8 Union Territories.
   - Built-in recognition for major industrial clusters: Surat, Rajkot, Pune, Ludhiana, Tiruppur, Coimbatore, Moradabad, Faridabad, Jodhpur, Peenya (Bengaluru).
   - Configurable MSME Taxonomy across Sectors A through Q (Manufacturing, Food Processing, Textiles, Auto Parts, Exporters, etc.).
   - Standardized 6-digit Indian PIN code and 10-digit mobile/landline normalization (+91/0 prefix stripping).

2. **Zero-Spam, Legal Data Connectors**:
   - OpenStreetMap India Business Registry (ODbL certified, free of cost, attribution preserved).
   - data.gov.in (Government Open Data License India — GODL compliant).
   - User CSV/Excel stream parser with intelligent Indian header auto-mapping.
   - Google Places API adapter (ready for production API keys with rate-limiting and cost guardrails).
   - Strict adherence to DPDP Act 2023 and TRAI DND regulations.

3. **Multi-Signal Deduplication & Suppression**:
   - Cross-matches normalized 10-digit phone numbers, official domains, and token Jaccard similarity (≥ 0.85) on business names.
   - Central suppression list to immediately block opted-out businesses.

4. **100-Point Transparent Lead Scoring**:
   - **Digital Need (30 pts)**: Detects absence of website, broken/outdated HTTP, lack of SSL, missing mobile viewport.
   - **Commercial Fit (25 pts)**: Evaluates B2B sector value (Manufacturers, Exporters, Small/Medium tier).
   - **Contactability (20 pts)**: Verified Indian phone, business email, physical address.
   - **Evidence Quality & Freshness (15 pts)**: Multi-point verified evidence within 30 days.
   - **Geographic Cluster Fit (10 pts)**: High weighting for verified industrial manufacturing hubs.
   - Dynamic weights configurable directly from the dashboard without code changes.

5. **AI Sales Intelligence & Bilingual Outreach (EN/HI)**:
   - Automated sales briefs for sales representatives.
   - Pre-drafted, personalized Email, WhatsApp, and Phone scripts in both English and Hindi.
   - Distinguishes facts from hypotheses with a dedicated salesperson verification checklist.
   - Specific introductory packages (₹5,999 Starter Website, ₹7,999 B2B Digital Catalogue, ₹14,999 Export Showcase).

6. **Full-Featured 8-View Web Application**:
   - **Executive Dashboard**: Real-time KPIs, stage funnel, state & industry breakdown, query costs.
   - **Lead Explorer**: Faceted search, filtering by state/category/status/score, sorting, pagination, CSV export.
   - **Lead Details Drawer**: Full record, score gauge, point breakdown, multilingual outreach drafts, audit trail.
   - **Research Operations**: Active source registry, batch cluster discovery jobs, job execution logs.
   - **Campaign Manager**: Human-in-the-loop review and approval queue before outreach transmission.
   - **Sales CRM (Kanban)**: Visual pipeline board from Discovered to Closed Won.
   - **Reports & ROI**: Lead quality by source, regional conversion, and service revenue.
   - **Settings**: Live scoring weight sliders, suppression registry, and daily budget caps.

---

## 🛠️ Tech Stack

- **Runtime**: Node.js v24 (Native `node:sqlite` database, zero external dependencies).
- **Backend**: Native Node HTTP Server & REST API with streaming endpoints.
- **Frontend**: Modern Vanilla JS (ES6+), Semantic HTML5, CSS Variables, Responsive Grid/Flexbox.
- **Testing**: Native Node Test Runner (`node --test`), 17 automated unit and integration tests.

---

## 🏃 Quick Start

### 1. Run Unit & Integration Tests
```bash
npm test
```

### 2. Seed Database with Pilot Benchmark Leads
```bash
npm run seed
```

### 3. Start the Web Application
```bash
npm start
```
The application will be accessible at: `http://localhost:3000`

---

## 📁 Project Structure

```
msme-growth-engine/
├── ROADMAP.md                  # GSD Roadmap with milestone tracking
├── STATE.md                    # Live GSD working state
├── package.json                # Project scripts and metadata
├── src/
│   ├── db/
│   │   ├── schema.js           # Relational SQLite schema definition
│   │   ├── index.js            # DB connection, transactions, and seeding
│   │   └── seed.js             # Pilot benchmark MSME generator
│   ├── core/
│   │   ├── taxonomy.js         # 28 States, 8 UTs, Sectors A-Q, normalization
│   │   ├── deduplication.js    # Multi-signal deduplication & suppression
│   │   ├── scoring.js          # 100-point transparent scoring engine
│   │   ├── website_checker.js  # Safe HTTP/SSL/Mobile viewport auditor
│   │   ├── sales_intelligence.js # Bilingual sales brief generator (EN/HI)
│   │   └── operations_manager.js # Autonomous discovery & ingestion pipeline
│   ├── sources/
│   │   ├── csv_adapter.js      # Resilient CSV parser with Indian column auto-mapping
│   │   └── osm_adapter.js      # OpenStreetMap India discovery adapter
│   └── server.js               # REST API and static file web server
├── public/
│   ├── index.html              # 8-view Single Page Web Application
│   ├── style.css               # Modern, accessible, responsive CSS styling
│   └── app.js                  # Frontend client controller and state manager
└── tests/
    ├── core.test.js            # Unit tests for taxonomy, deduplication, scoring
    └── server.test.js          # Integration tests for all REST API endpoints
```
