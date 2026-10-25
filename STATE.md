# Project State: BharatGrowth AI

## Current Focus
* Working on: Production Web UI, AI CMO Command Center, Mantis AI Local Intelligence Scanner, and Factory Inventory & BOM Operations.
* Active Status: Live server running at `http://localhost:3000` with 20/20 automated tests passing. Full web-based lead discovery, map-first intelligence, factory inventory tracking, and 1-click WhatsApp/Email outreach.

## Recent Decisions
* Integrated **AI CMO Command Center** (`view-cmo`): Real-time revenue quotas (₹1,50,000/week), industrial cluster opportunity matrix (Rajkot, Coimbatore, Pune, Tiruppur, Faridabad), service package conversion velocity, and factory consultative sales playbook.
* Built **Mantis AI Lead Finder** (`view-mantisai` and `src/sources/mantisai_adapter.js`): Map-first live cluster scanning engine targeting Google Maps ratings, reviews, website gaps (No Website / Outdated), and operational buying signals with 1-click CRM ingestion.
* Added **Factory Inventory & BOM Operations Tab** in the Lead Drawer: Deep shopfloor tracking for raw material stocks, multi-stage Bill of Materials (BOM) workflows, scrap/waste variance QC alerts, and distributor dispatch TAT.
* Built **Direct 1-Click Outreach Action Links**: Pre-populated WhatsApp message link (`wa.me/91...`) and direct Email link (`mailto:...`) in both English and Hindi.
* Maintained zero external npm runtime dependencies using Node.js v24 native `node:sqlite`, native HTTP server, and native `node:test`.

## Verified Results & Metrics
* 20 automated tests passing across taxonomy, deduplication, 100-point scoring, sales intelligence, CSV parsing, operations pipeline, and all REST API endpoints.
* Sprint deliverable exports verified and formatted:
  - `india_msme_leads.csv` (48 verified leads across India)
  - `india_msme_leads.xlsx` (4-sheet formatted workbook)
  - `research_summary.txt` (executive methodology and cluster breakdown)
  - `top_20_prospects.txt` (top 20 high-priority prospects with facts vs inferences)
* Operating Cost to date: ₹0.00 (Zero paid API expenditure; 100% legal open and curated intelligence).

## Next Steps for the Founder
1. Open the Web Dashboard at `http://localhost:3000`.
2. Navigate to **Mantis AI Finder** to scan live industrial clusters and import new factory leads with 1 click.
3. Open any lead in **Lead Explorer** or **CRM Kanban** to inspect the **Factory Inventory & BOM** tab.
4. Launch outreach directly via the **WhatsApp Lead** and **Send Email** buttons.

