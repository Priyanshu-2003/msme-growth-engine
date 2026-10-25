# Project Roadmap: BharatGrowth AI (India-Wide MSME Growth & Lead Engine)

## Milestone 1: Core Foundation & Data Architecture [Completed]
- [x] Phase 1.1: Project workspace initialization & environment audit <!-- completed: 2026-10-24 -->
- [x] Phase 1.2: Normalized relational database schema & persistence engine <!-- completed: 2026-10-24 -->
  - [x] Design leads, sources, jobs, campaigns, sales briefs, suppression tables
  - [x] Implement native SQLite persistence layer with JSON fields & indexing
  - [x] Add unit tests for database schema, constraints, and audit history
- [x] Phase 1.3: Indian MSME taxonomy & deduplication engine <!-- completed: 2026-10-24 -->
  - [x] Define 28 States, 8 UTs, major industrial districts, and Categories A-Q
  - [x] Implement robust multi-identifier deduplication (phone, name, domain, address)
- [x] Phase 1.4: 100-Point configurable lead scoring & queue classification <!-- completed: 2026-10-24 -->
  - [x] Implement scoring logic across 5 weighted dimensions
  - [x] Implement dynamic weights configurable via dashboard settings

## Milestone 2: Discovery Engine & Digital-Need Detection [Completed]
- [x] Phase 2.1: Data source connectors & provenance registry <!-- completed: 2026-10-24 -->
  - [x] CSV/Excel bulk import adapter with column auto-mapping
  - [x] OpenStreetMap / Overpass India manufacturing & commerce adapter
  - [x] data.gov.in & Google Maps Platform adapters with legal provenance
- [x] Phase 2.2: Automated website detection & digital-presence auditor <!-- completed: 2026-10-24 -->
  - [x] DNS, HTTP/HTTPS, SSL, mobile responsiveness, and social presence checker
  - [x] 6-tier website status classification with timestamped evidence
- [x] Phase 2.3: Autonomous Operations Manager & background job runner <!-- completed: 2026-10-24 -->
  - [x] Resumable discovery and enrichment pipeline with budget/rate-limit guards

## Milestone 3: AI Sales Intelligence & CRM Pipeline [Completed]
- [x] Phase 3.1: Personalized sales brief & bilingual outreach generator (EN/HI) <!-- completed: 2026-10-24 -->
  - [x] Value proposition mapping for Indian MSME growth services
  - [x] Hypothesis-labeled sales briefs with verification checklist
- [x] Phase 3.2: Sales CRM & outreach workflow <!-- completed: 2026-10-24 -->
  - [x] 11-stage pipeline (Discovered → Qualified → Approved → Won/Lost)
  - [x] Human-in-the-loop approval queue and suppression/opt-out management

## Milestone 4: Production Web Application & Pilot Launch [Completed]
- [x] Phase 4.1: High-performance HTTP server & REST API <!-- completed: 2026-10-24 -->
- [x] Phase 4.2: Full-featured 8-view Web UI (Dashboard, Explorer, Detail, Ops, Campaigns, CRM, Settings, Reports) <!-- completed: 2026-10-24 -->
- [x] Phase 4.3: Automated test suite, real pilot verification & documentation <!-- completed: 2026-10-24 -->

## Milestone 5: Future Scaling & Integrations [Pending]
- [ ] Connect live Google Cloud Places API key for real-time commercial discovery
- [ ] WhatsApp Business Cloud API automated sending webhook for approved outreach
- [ ] Razorpay / Cashfree payment link integration for introductory package checkouts
