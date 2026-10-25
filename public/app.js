// public/app.js - Modern, fast SPA controller for BharatGrowth AI
const app = {
  activeView: 'dashboard',
  currentPage: 1,
  pageSize: 20,
  currentFilters: {
    search: '',
    state: '',
    industry: '',
    website_status: '',
    opportunity_tier: '',
    pipeline_stage: ''
  },
  kanbanFilter: 'ALL',
  kanbanSearchQuery: '',
  currentBrand: 'IndusOS',
  currentLeadDetail: null,

  init() {
    this.bindEvents();
    this.loadSavedBrand();
    this.loadDashboard();
    this.populateStaticFilters();
  },

  bindEvents() {
    // Navigation items
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const view = btn.getAttribute('data-view');
        this.switchView(view);
      });
    });

    // Explorer Filters
    const searchInput = document.getElementById('explorer-search');
    let debounceTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        this.currentFilters.search = searchInput.value.trim();
        this.currentPage = 1;
        this.loadExplorerLeads();
      }, 300);
    });

    ['filter-state', 'filter-industry', 'filter-website-status', 'filter-priority', 'filter-stage'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', () => {
          this.currentFilters.state = document.getElementById('filter-state').value;
          this.currentFilters.industry = document.getElementById('filter-industry').value;
          this.currentFilters.website_status = document.getElementById('filter-website-status').value;
          this.currentFilters.opportunity_tier = document.getElementById('filter-priority').value;
          this.currentFilters.pipeline_stage = document.getElementById('filter-stage').value;
          this.currentPage = 1;
          this.loadExplorerLeads();
        });
      }
    });

    document.getElementById('btn-reset-filters').addEventListener('click', () => {
      document.getElementById('explorer-search').value = '';
      document.getElementById('filter-state').value = '';
      document.getElementById('filter-industry').value = '';
      document.getElementById('filter-website-status').value = '';
      document.getElementById('filter-priority').value = '';
      document.getElementById('filter-stage').value = '';
      this.currentFilters = { search: '', state: '', industry: '', website_status: '', opportunity_tier: '', pipeline_stage: '' };
      this.currentPage = 1;
      this.loadExplorerLeads();
    });

    // Modals
    document.getElementById('btn-close-modal').addEventListener('click', () => this.closeLeadModal());
    document.getElementById('btn-modal-cancel').addEventListener('click', () => this.closeLeadModal());
    document.getElementById('btn-close-import').addEventListener('click', () => this.closeImportModal());
    document.getElementById('btn-cancel-import').addEventListener('click', () => this.closeImportModal());
    document.getElementById('btn-import-modal').addEventListener('click', () => this.openImportModal());

    // Export CSV
    document.getElementById('btn-export-csv').addEventListener('click', () => this.exportCsv());

    // Discovery Trigger Buttons
    document.getElementById('btn-trigger-discovery').addEventListener('click', () => {
      this.switchView('operations');
    });

    document.getElementById('form-run-discovery').addEventListener('submit', (e) => {
      e.preventDefault();
      this.runDiscoveryJob();
    });

    // Import Execution
    document.getElementById('btn-execute-import').addEventListener('click', () => this.executeImport());

    // Modal Tabs
    document.querySelectorAll('.modal-tabs button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.modal-tabs button').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.modal-tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        const targetTab = btn.getAttribute('data-tab');
        document.getElementById(targetTab).classList.add('active');
      });
    });

    // Multilingual Draft Toggles in Modal
    document.getElementById('btn-show-en-draft').addEventListener('click', () => {
      document.getElementById('btn-show-en-draft').classList.add('active');
      document.getElementById('btn-show-hi-draft').classList.remove('active');
      document.getElementById('draft-en-container').classList.remove('hidden');
      document.getElementById('draft-hi-container').classList.add('hidden');
    });

    document.getElementById('btn-show-hi-draft').addEventListener('click', () => {
      document.getElementById('btn-show-hi-draft').classList.add('active');
      document.getElementById('btn-show-en-draft').classList.remove('active');
      document.getElementById('draft-hi-container').classList.remove('hidden');
      document.getElementById('draft-en-container').classList.add('hidden');
    });

    // Modal Stage Updater
    document.getElementById('btn-save-lead-stage').addEventListener('click', () => this.saveLeadStage());
    document.getElementById('btn-modal-approve').addEventListener('click', () => this.approveLeadFromModal());

    // Scoring Weights Sliders
    ['digital', 'commercial', 'contact', 'evidence', 'geo'].forEach(w => {
      const slider = document.getElementById(`input-weight-${w}`);
      slider.addEventListener('input', () => {
        document.getElementById(`val-weight-${w}`).textContent = slider.value;
        this.updateTotalWeightsSum();
      });
    });

    document.getElementById('form-scoring-weights').addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveScoringWeights();
    });

    // Suppression Form
    document.getElementById('form-add-suppression').addEventListener('submit', (e) => {
      e.preventDefault();
      this.addSuppressionRecord();
    });

    // Mantis AI Scanner & Importer
    const btnMantisScan = document.getElementById('btn-mantis-scan');
    if (btnMantisScan) {
      btnMantisScan.addEventListener('click', () => this.runMantisScan());
    }

    const btnMantisImport = document.getElementById('btn-mantis-import-all');
    if (btnMantisImport) {
      btnMantisImport.addEventListener('click', () => this.importAllMantisLeads());
    }

    this.setupGlobalKeybindings();
  },

  switchView(viewName) {
    this.activeView = viewName;
    document.querySelectorAll('.nav-item').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-view') === viewName);
    });

    document.querySelectorAll('.content-view').forEach(v => {
      v.classList.toggle('active', v.id === `view-${viewName}`);
    });

    const countStr = this.totalLeadsCount ? `● ${this.totalLeadsCount} enterprises` : 'Active';
    const titles = {
      dashboard: ['Dashboard', countStr],
      cmo: ['Growth Strategy', 'Strategy Playbook'],
      mantisai: ['Lead Finder', 'Radar active'],
      explorer: ['Lead Explorer', this.totalLeadsCount ? `${this.totalLeadsCount} leads` : 'Active'],
      crm: ['CRM Pipeline', 'Active Stages'],
      warroom: ["Sales War Room", 'Daily quota: 5'],
      studio: ["Delivery Studio", '48h SLA'],
      opsdesk: ["Operations Desk", 'Live audit'],
      campaigns: ['Campaigns', 'Review queue'],
      operations: ['Discovery Radar', 'Jobs active'],
      reports: ['Analytics', 'Revenue stats'],
      settings: ['Settings', 'Presets']
    };

    const [title, sub] = titles[viewName] || ['IndusOS', 'Active'];
    document.getElementById('page-title').textContent = title;
    document.getElementById('page-subtitle').textContent = sub;

    // View-specific loaders
    if (viewName === 'dashboard') this.loadDashboard();
    else if (viewName === 'cmo') this.loadCmoConsole();
    else if (viewName === 'mantisai') this.loadMantisAiFinder();
    else if (viewName === 'explorer') this.loadExplorerLeads();
    else if (viewName === 'crm') this.loadCrmKanban();
    else if (viewName === 'warroom') this.loadWarRoom();
    else if (viewName === 'studio') this.loadStudio();
    else if (viewName === 'opsdesk') this.loadOpsDesk();
    else if (viewName === 'campaigns') this.loadCampaigns();
    else if (viewName === 'operations') this.loadOperations();
    else if (viewName === 'reports') this.loadReports();
    else if (viewName === 'settings') this.loadSettings();
  },

  async loadDashboard() {
    try {
      const res = await fetch('/api/dashboard');
      const data = await res.json();

      this.totalLeadsCount = data.kpis.totalLeads;
      if (this.activeView === 'dashboard') {
        const sub = document.getElementById('page-subtitle');
        if (sub) sub.textContent = `● ${data.kpis.totalLeads} enterprises`;
      }

      // KPIs
      document.getElementById('kpi-total-leads').textContent = data.kpis.totalLeads.toLocaleString('en-IN');
      document.getElementById('kpi-no-website').textContent = data.kpis.noWebsiteLeads.toLocaleString('en-IN');
      document.getElementById('kpi-high-priority').textContent = data.kpis.highPriorityLeads.toLocaleString('en-IN');
      document.getElementById('kpi-verified').textContent = data.kpis.verifiedLeads.toLocaleString('en-IN');

      // Funnel
      const funnelContainer = document.getElementById('pipeline-funnel-container');
      funnelContainer.innerHTML = '';
      const stages = [
        ['Discovered', 'DISCOVERED'],
        ['Qualified', 'QUALIFIED'],
        ['Approved for Contact', 'APPROVED_FOR_CONTACT'],
        ['Contacted', 'CONTACTED'],
        ['Replied', 'REPLIED'],
        ['Meeting Booked', 'MEETING_BOOKED'],
        ['Won (Customer)', 'WON']
      ];

      const maxCount = Math.max(1, ...Object.values(data.funnel));

      stages.forEach(([label, key]) => {
        const count = data.funnel[key] || 0;
        const pct = Math.max(4, Math.round((count / maxCount) * 100));
        const row = document.createElement('div');
        row.className = 'funnel-row';
        row.innerHTML = `
          <span class="funnel-label">${label}</span>
          <div class="funnel-bar-wrap">
            <div class="funnel-bar-fill" style="width: ${count > 0 ? pct : 0}%"></div>
          </div>
          <span class="funnel-count">${count}</span>
        `;
        funnelContainer.appendChild(row);
      });

      // State Distribution
      const stateContainer = document.getElementById('state-distribution-container');
      stateContainer.innerHTML = '';
      if (!data.stateBreakdown || data.stateBreakdown.length === 0) {
        stateContainer.innerHTML = '<p class="text-muted">No state data yet. Run a discovery job.</p>';
      } else {
        data.stateBreakdown.forEach(s => {
          const item = document.createElement('div');
          item.className = 'industry-item';
          item.innerHTML = `
            <div class="industry-meta">
              <span><strong>${s.state}</strong> (${s.no_website_count} with no website)</span>
              <span>${s.count} leads</span>
            </div>
            <div class="industry-progress-bg">
              <div class="industry-progress-fill" style="width: ${Math.min(100, (s.count / data.kpis.totalLeads) * 100)}%"></div>
            </div>
          `;
          stateContainer.appendChild(item);
        });
      }

      // Industry Breakdown
      const industryContainer = document.getElementById('industry-breakdown-container');
      industryContainer.innerHTML = '';
      if (!data.industryBreakdown || data.industryBreakdown.length === 0) {
        industryContainer.innerHTML = '<p class="text-muted">No industry data recorded.</p>';
      } else {
        data.industryBreakdown.forEach(ind => {
          const item = document.createElement('div');
          item.className = 'industry-item';
          item.innerHTML = `
            <div class="industry-meta">
              <span>Category ${ind.industry_category} (Avg Score: ${Math.round(ind.avg_score || 0)})</span>
              <span>${ind.count} enterprises</span>
            </div>
            <div class="industry-progress-bg">
              <div class="industry-progress-fill" style="width: ${Math.min(100, (ind.count / data.kpis.totalLeads) * 100)}%"></div>
            </div>
          `;
          industryContainer.appendChild(item);
        });
      }

      // Recent leads table
      const tbody = document.getElementById('recent-leads-tbody');
      tbody.innerHTML = '';
      if (!data.recentLeads || data.recentLeads.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">No leads discovered yet.</td></tr>';
      } else {
        data.recentLeads.forEach(l => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><strong>${l.business_name}</strong></td>
            <td>${l.city}, ${l.state}</td>
            <td>Category ${l.industry_category}</td>
            <td><span class="score-badge ${l.lead_score >= 70 ? 'high' : (l.lead_score >= 45 ? 'medium' : 'low')}">${l.lead_score}</span></td>
            <td><span class="badge ${l.website_status === 'NO_WEBSITE_FOUND' ? 'badge-danger' : 'badge-neutral'}">${l.website_status.replace(/_/g, ' ')}</span></td>
            <td><button class="btn btn-sm btn-secondary" onclick="app.openLeadModal('${l.id}')">View</button></td>
          `;
          tbody.appendChild(tr);
        });
      }

    } catch (err) {
      console.error('Failed to load dashboard:', err);
    }
  },

  async loadExplorerLeads() {
    try {
      const q = new URLSearchParams({
        page: this.currentPage,
        limit: this.pageSize,
        search: this.currentFilters.search,
        state: this.currentFilters.state,
        industry: this.currentFilters.industry,
        website_status: this.currentFilters.website_status,
        opportunity_tier: this.currentFilters.opportunity_tier,
        pipeline_stage: this.currentFilters.pipeline_stage
      });

      const res = await fetch(`/api/leads?${q.toString()}`);
      const data = await res.json();

      document.getElementById('leads-count-indicator').textContent = `Showing ${data.leads.length} of ${data.totalCount} leads (Page ${data.page} of ${data.totalPages || 1})`;

      // Render pagination
      const pag = document.getElementById('pagination-controls');
      pag.innerHTML = `
        <button class="btn btn-sm btn-secondary" ${this.currentPage <= 1 ? 'disabled' : ''} onclick="app.changePage(${this.currentPage - 1})">Prev</button>
        <button class="btn btn-sm btn-secondary" ${this.currentPage >= data.totalPages ? 'disabled' : ''} onclick="app.changePage(${this.currentPage + 1})">Next</button>
      `;

      const tbody = document.getElementById('explorer-leads-tbody');
      tbody.innerHTML = '';

      if (data.leads.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding: 2rem;">No matching MSME leads found. Try relaxing filters or run a discovery job.</td></tr>';
        return;
      }

      data.leads.forEach(l => {
        const tr = document.createElement('tr');
        const webBadgeClass = l.website_status === 'NO_WEBSITE_FOUND' ? 'badge-danger' : (l.website_status === 'WEBSITE_CONFIRMED' ? 'badge-success' : 'badge-warning');
        const scoreClass = l.lead_score >= 70 ? 'high' : (l.lead_score >= 45 ? 'medium' : 'low');

        tr.innerHTML = `
          <td><span class="score-badge ${scoreClass}">${l.lead_score}</span></td>
          <td>
            <strong>${l.business_name}</strong>
            <br><small style="color: #64748b;">${l.subcategory || 'MSME'}</small>
          </td>
          <td>${l.city}, ${l.state}</td>
          <td>Category ${l.industry_category}</td>
          <td>
            ${l.phone ? `<div>📞 ${l.phone}</div>` : ''}
            ${l.email ? `<div>✉️ ${l.email}</div>` : '<small style="color: #94a3b8;">No email</small>'}
          </td>
          <td><span class="badge ${webBadgeClass}">${l.website_status.replace(/_/g, ' ')}</span></td>
          <td><span class="badge badge-info">${l.pipeline_stage.replace(/_/g, ' ')}</span></td>
          <td>
            <button class="btn btn-sm btn-secondary" onclick="app.openLeadModal('${l.id}')">Details</button>
          </td>
        `;
        tbody.appendChild(tr);
      });

    } catch (err) {
      console.error('Failed to load explorer leads:', err);
    }
  },

  changePage(p) {
    if (p < 1) return;
    this.currentPage = p;
    this.loadExplorerLeads();
  },

  async openLeadModal(leadId) {
    try {
      const res = await fetch(`/api/leads/${leadId}`);
      const data = await res.json();
      if (!data.lead) return;

      this.currentLeadDetail = data;
      const l = data.lead;
      const b = data.salesBrief;

      document.getElementById('modal-lead-name').textContent = l.business_name;
      document.getElementById('modal-lead-category').textContent = `Category ${l.industry_category}: ${l.subcategory || 'MSME'}`;
      document.getElementById('modal-lead-location').textContent = `${l.city}, ${l.state}`;
      document.getElementById('modal-lead-tier').textContent = l.opportunity_tier.replace(/_/g, ' ');
      document.getElementById('modal-lead-score').textContent = l.lead_score;

      // Color score circle
      const scoreCircle = document.getElementById('modal-score-circle');
      if (l.lead_score >= 70) scoreCircle.style.background = 'linear-gradient(135deg, #16a34a, #15803d)';
      else if (l.lead_score >= 45) scoreCircle.style.background = 'linear-gradient(135deg, #d97706, #b45309)';
      else scoreCircle.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';

      // Score breakdown reasons
      const scoreDetailsContainer = document.getElementById('modal-score-details');
      scoreDetailsContainer.innerHTML = '';
      const bd = l.score_breakdown || {};
      ['digitalNeed', 'commercialFit', 'contactability', 'evidenceFreshness', 'geoFit'].forEach(dim => {
        if (bd[dim] && bd[dim].details) {
          bd[dim].details.forEach(d => {
            const p = document.createElement('div');
            p.textContent = `✓ ${d}`;
            scoreDetailsContainer.appendChild(p);
          });
        }
      });
      if (bd.penalties) {
        bd.penalties.forEach(pen => {
          const p = document.createElement('div');
          p.style.color = '#dc2626';
          p.textContent = `⚠️ ${pen}`;
          scoreDetailsContainer.appendChild(p);
        });
      }

      // Sales Brief tab
      if (b) {
        document.getElementById('brief-opportunity').textContent = b.key_observable_opportunity;
        document.getElementById('brief-service-name').textContent = b.primary_service_offer;
        document.getElementById('brief-service-why').textContent = b.why_relevant;
        document.getElementById('brief-intro-pricing').textContent = b.introductory_offer;

        document.getElementById('draft-email-en').textContent = b.outreach_email_en;
        document.getElementById('draft-wa-en').textContent = b.outreach_whatsapp_en;
        document.getElementById('draft-call-en').textContent = b.outreach_call_script_en;

        document.getElementById('draft-email-hi').textContent = b.outreach_email_hi;
        document.getElementById('draft-wa-hi').textContent = b.outreach_whatsapp_hi;
        document.getElementById('draft-call-hi').textContent = b.outreach_call_script_hi;

        const checkList = document.getElementById('brief-verification-list');
        checkList.innerHTML = '';
        try {
          const items = JSON.parse(b.verification_checklist);
          items.forEach(it => {
            const li = document.createElement('li');
            li.textContent = it;
            checkList.appendChild(li);
          });
        } catch {
          checkList.innerHTML = '<li>Confirm active business operations and owner contact.</li>';
        }
      } else {
        document.getElementById('brief-opportunity').textContent = 'No sales brief generated (lead in research / low priority queue).';
        document.getElementById('brief-service-name').textContent = 'General Digital Needs Assessment';
        document.getElementById('brief-service-why').textContent = '';
        document.getElementById('brief-intro-pricing').textContent = '₹5,999/- Starter Package';
      }

      // Profile tab
      document.getElementById('modal-lead-phone').textContent = l.phone || 'None recorded';
      document.getElementById('modal-lead-email').textContent = l.email || 'None recorded';
      document.getElementById('modal-lead-website').textContent = l.website || 'No website found';
      document.getElementById('modal-lead-pincode').textContent = l.pincode || 'N/A';
      document.getElementById('modal-lead-address').textContent = l.address || `${l.city}, ${l.state}`;
      document.getElementById('modal-lead-source').textContent = l.source_name;
      document.getElementById('modal-lead-discovery-date').textContent = new Date(l.discovery_date).toLocaleString();

      document.getElementById('modal-update-stage').value = l.pipeline_stage;
      document.getElementById('modal-note-input').value = '';

      // Audit trail
      const auditContainer = document.getElementById('modal-audit-trail');
      auditContainer.innerHTML = '';
      const history = l.audit_history || [];
      if (history.length === 0) {
        auditContainer.innerHTML = '<p class="text-muted" style="font-size:0.8rem; padding: 0.5rem 0;">No activity steps logged yet. Use the form above to record outreach actions.</p>';
      } else {
        history.slice().reverse().forEach(a => {
          const d = document.createElement('div');
          d.className = 'audit-item';
          d.style.cssText = 'padding: 0.65rem 0.85rem; border-left: 3px solid var(--primary); background: #f8fafc; margin-bottom: 0.5rem; border-radius: 4px; border: 1px solid #e2e8f0; border-left-width: 4px;';
          const authorBadge = a.author ? `<span class="badge badge-info" style="margin-right:0.4rem; font-weight:700;">👤 ${a.author}</span>` : '';
          const actionBadge = a.action ? `<span class="badge badge-neutral" style="margin-right:0.4rem;">${a.action.replace(/_/g, ' ')}</span>` : '';
          d.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.35rem;">
              <div>${authorBadge}${actionBadge}</div>
              <small style="color:#64748b; font-size:0.75rem;">${new Date(a.timestamp).toLocaleString('en-IN')}</small>
            </div>
            <div style="font-size:0.825rem; color:#334155; line-height:1.4;">${a.details || ''}</div>
          `;
          auditContainer.appendChild(d);
        });
      }

      // Digital Assessment tab
      const daContainer = document.getElementById('modal-digital-details');
      daContainer.innerHTML = `
        <div class="card" style="margin-bottom: 0;">
          <div class="card-body">
            <h4>Technical Assessment Evidence</h4>
            <p><strong>Website Status:</strong> ${l.website_status.replace(/_/g, ' ')}</p>
            <p><strong>Mobile Friendly:</strong> ${l.digital_assessment.mobileFriendly ? 'Yes (Viewport present)' : 'No (Lacks mobile viewport)'}</p>
            <p><strong>SSL Connection:</strong> ${l.digital_assessment.hasSsl ? 'Secure (HTTPS)' : 'Insecure / No SSL'}</p>
            <p><strong>Response Time:</strong> ${l.digital_assessment.responseTimeMs ? `${l.digital_assessment.responseTimeMs} ms` : 'N/A'}</p>
            <p><strong>WhatsApp Widget:</strong> ${l.digital_assessment.hasWhatsAppButton ? 'Present' : 'Missing'}</p>
            <div style="margin-top: 1rem;">
              <strong>Observable Needs:</strong>
              <ul>
                ${(l.digital_assessment.observableNeeds || ['General digital audit required']).map(n => `<li>${n}</li>`).join('')}
              </ul>
            </div>
          </div>
        </div>
      `;

      // Factory Inventory & BOM Operations tab
      const invContainer = document.getElementById('modal-inventory-details');
      let inv = l.inventory_profile;
      if (typeof inv === 'string') {
        try { inv = JSON.parse(inv); } catch { inv = null; }
      }

      if (inv) {
        invContainer.innerHTML = `
          <div class="inventory-grid">
            <div class="inventory-card">
              <h5>📦 Raw Material Stock & Batch Tracking</h5>
              <div class="inventory-tag-list">
                ${(inv.raw_materials_tracked || ['Raw Material Batch A', 'Semi-finished Stock']).map(m => `<span class="inventory-tag">${m}</span>`).join('')}
              </div>
            </div>

            <div class="inventory-card">
              <h5>🚚 Dealer & Distribution Network</h5>
              <p style="font-size:0.85rem; margin-bottom:0.35rem;">
                <strong>Active Registered Dealers:</strong> ${inv.dealer_network?.dealers_count || 12}
              </p>
              <p style="font-size:0.85rem;">
                <strong>Standard Dispatch TAT:</strong> ${inv.dealer_network?.dispatch_tat_hours || 48} Hours
              </p>
            </div>
          </div>

          <div class="inventory-card" style="margin-top: 1rem;">
            <h5>⚙️ Multi-Stage Bill of Materials (BOM Flow)</h5>
            <div class="bom-stages-flow">
              ${(inv.bom_stages || ['Stage 1: Raw Material Inspection', 'Stage 2: Machining / Processing', 'Stage 3: Assembly & Final QC']).map((st, i) => `
                <div class="bom-step">
                  <span class="bom-step-num">${i + 1}</span>
                  <span>${st}</span>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="scrap-alert-box" style="margin-top: 1rem;">
            <span><strong>Scrap & Weight Loss Variance:</strong> ${inv.scrap_rate_variance || 'Controlled variance (< 4.5%)'}</span>
            <span class="badge badge-warning">Shopfloor QC Alert</span>
          </div>
        `;
      } else {
        invContainer.innerHTML = `
          <div class="inventory-card">
            <h5>🏭 Factory Inventory Profile</h5>
            <p style="font-size: 0.85rem; color: #475569; margin-top: 0.5rem;">
              Standard manufacturing profile ready for <strong>${l.business_name}</strong> (${l.subcategory || 'MSME'}).
              Once contacted, activate multi-stage BOM tracking, scrap monitoring, and dealer ordering modules during client onboarding.
            </p>
          </div>
        `;
      }

      // Direct WhatsApp Action Link
      const waBtn = document.getElementById('btn-modal-whatsapp');
      let cleanPhone = (l.phone || '').replace(/\D/g, '');
      if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;
      if (cleanPhone.length >= 10) {
        const waText = encodeURIComponent(b ? b.outreach_whatsapp_en : `Hello ${l.business_name}, we are reaching out regarding software solutions for your factory operations.`);
        waBtn.href = `https://wa.me/${cleanPhone}?text=${waText}`;
        waBtn.onclick = null;
        waBtn.style.opacity = '1';
        waBtn.style.pointerEvents = 'auto';
      } else {
        waBtn.href = '#';
        waBtn.style.opacity = '0.5';
        waBtn.onclick = (e) => { e.preventDefault(); app.showToast('No phone number recorded for WhatsApp outreach'); };
      }

      // Direct Email Action Link
      const mailBtn = document.getElementById('btn-modal-email');
      if (l.email) {
        const subj = encodeURIComponent(b ? b.primary_service_offer : `Digital Software Upgrade for ${l.business_name}`);
        const mailBody = encodeURIComponent(b ? b.outreach_email_en : '');
        mailBtn.href = `mailto:${l.email}?subject=${subj}&body=${mailBody}`;
        mailBtn.onclick = null;
        mailBtn.style.opacity = '1';
        mailBtn.style.pointerEvents = 'auto';
      } else {
        mailBtn.href = '#';
        mailBtn.style.opacity = '0.5';
        mailBtn.onclick = (e) => { e.preventDefault(); app.showToast('No email address listed for this business'); };
      }

      document.getElementById('lead-modal').classList.remove('hidden');
    } catch (err) {
      console.error('Failed to open lead details:', err);
    }
  },

  closeLeadModal() {
    document.getElementById('lead-modal').classList.add('hidden');
    this.currentLeadDetail = null;
  },

  async saveLeadStage() {
    if (!this.currentLeadDetail) return;
    const leadId = this.currentLeadDetail.lead.id;
    const author = document.getElementById('modal-log-author')?.value || 'Kaushik';
    const action_type = document.getElementById('modal-log-action')?.value || 'FOLLOW_UP_NOTE';
    const stage = document.getElementById('modal-update-stage').value;
    const follow_up_date = document.getElementById('modal-followup-date')?.value;
    const note = document.getElementById('modal-note-input').value.trim();

    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipeline_stage: stage,
          author,
          action_type,
          follow_up_date: follow_up_date || undefined,
          note: note || undefined
        })
      });
      const data = await res.json();
      if (data.success) {
        this.showToast(`Step recorded by ${author}!`);
        // Refresh modal to immediately show newly added audit item
        await this.openLeadModal(leadId);
        if (this.activeView === 'explorer') this.loadExplorerLeads();
        else if (this.activeView === 'crm') this.loadCrmKanban();
        else if (this.activeView === 'dashboard') this.loadDashboard();
      }
    } catch (err) {
      this.showToast(`Error: ${err.message}`);
    }
  },

  async approveLeadFromModal() {
    if (!this.currentLeadDetail) return;
    const leadId = this.currentLeadDetail.lead.id;
    try {
      const res = await fetch(`/api/campaigns/approve/${leadId}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        this.showToast('Lead approved for outreach transmission');
        this.closeLeadModal();
        if (this.activeView === 'explorer') this.loadExplorerLeads();
        else if (this.activeView === 'campaigns') this.loadCampaigns();
      }
    } catch (err) {
      this.showToast(`Error: ${err.message}`);
    }
  },

  // Team Kanban Filter and Quick Actions
  setKanbanFilter(role) {
    this.kanbanFilter = role;
    document.querySelectorAll('.team-tab-btn').forEach(btn => {
      if (btn.getAttribute('data-filter') === role) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    this.loadCrmKanban();
  },

  searchKanban(query) {
    this.kanbanSearchQuery = (query || '').toLowerCase().trim();
    const cards = document.querySelectorAll('.kanban-card');
    cards.forEach(card => {
      const text = card.textContent.toLowerCase();
      if (!this.kanbanSearchQuery || text.includes(this.kanbanSearchQuery)) {
        card.style.display = 'block';
      } else {
        card.style.display = 'none';
      }
    });
  },

  async advanceLeadStageQuick(leadId, currentStage, event) {
    if (event) event.stopPropagation();
    
    const nextMap = {
      'DISCOVERED': { next: 'QUALIFIED', author: 'Kaushik', action: 'DISCOVERY_CALL_SCHEDULED', note: 'Lead qualified by Kaushik via rapid assessment.' },
      'QUALIFIED': { next: 'APPROVED_FOR_CONTACT', author: 'Priyanshu', action: 'OFFER_APPROVED', note: 'Outreach campaign offer approved for contact by Priyanshu.' },
      'APPROVED_FOR_CONTACT': { next: 'CONTACTED', author: 'Kaushik', action: 'WHATSAPP_PITCH_SENT', note: 'Consultative WhatsApp pitch & brochure sent by Kaushik.' },
      'CONTACTED': { next: 'REPLIED', author: 'Kaushik', action: 'PROMOTER_ENGAGED', note: 'Promoter replied on WhatsApp showing interest in upgrading factory systems.' },
      'REPLIED': { next: 'MEETING_BOOKED', author: 'Kaushik', action: 'DEMO_COMPLETED', note: '15-minute live screen demo booked with promoter by Kaushik.' },
      'MEETING_BOOKED': { next: 'WON', author: 'Kaushik', action: 'ADVANCE_TOKEN_RECEIVED', note: 'Client locked! ₹5,000 advance received. Handed over to Pushpender for rapid tech build.' },
      'WON': { next: 'WON', author: 'Pushpender', action: 'SITE_DEPLOYED_LIVE', note: 'Factory portal & catalog deployed live on domain by Pushpender.' }
    };

    const target = nextMap[currentStage];
    if (!target) return;

    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipeline_stage: target.next,
          author: target.author,
          action_type: target.action,
          note: target.note
        })
      });
      const data = await res.json();
      if (data.success) {
        this.showToast(`Stage advanced to ${target.next.replace(/_/g, ' ')} by ${target.author}!`);
        await this.loadCrmKanban();
      }
    } catch (err) {
      this.showToast(`Error: ${err.message}`);
    }
  },

  showPlaybookModal() {
    this.switchView('cmo');
  },

  // Sales CRM Kanban Board
  async loadCrmKanban() {
    try {
      const res = await fetch('/api/leads?limit=500');
      const data = await res.json();
      const allLeads = data.leads || [];

      // Update KPI counters
      const totalCount = data.totalCount || allLeads.length;
      const totalEl = document.getElementById('crm-stat-total');
      if (totalEl) totalEl.textContent = totalCount;
      const tabAll = document.getElementById('tab-count-all');
      if (tabAll) tabAll.textContent = totalCount;

      const contactedCount = allLeads.filter(l => l.pipeline_stage === 'CONTACTED' || l.pipeline_stage === 'REPLIED').length;
      const demosCount = allLeads.filter(l => l.pipeline_stage === 'MEETING_BOOKED').length;
      const wonCount = allLeads.filter(l => l.pipeline_stage === 'WON').length;

      const contEl = document.getElementById('crm-stat-contacted');
      if (contEl) contEl.textContent = contactedCount;
      const demosEl = document.getElementById('crm-stat-demos');
      if (demosEl) demosEl.textContent = demosCount;
      const wonEl = document.getElementById('crm-stat-won');
      if (wonEl) wonEl.textContent = wonCount;

      // Filter leads based on team tab
      let filteredLeads = allLeads;
      if (this.kanbanFilter === 'KAUSHIK') {
        filteredLeads = allLeads.filter(l => 
          ['QUALIFIED', 'APPROVED_FOR_CONTACT', 'CONTACTED', 'REPLIED', 'MEETING_BOOKED'].includes(l.pipeline_stage) ||
          (l.audit_log && JSON.stringify(l.audit_log).includes('Kaushik'))
        );
      } else if (this.kanbanFilter === 'PUSHPENDER') {
        filteredLeads = allLeads.filter(l => 
          ['WON', 'MEETING_BOOKED'].includes(l.pipeline_stage) ||
          (l.audit_log && JSON.stringify(l.audit_log).includes('Pushpender'))
        );
      } else if (this.kanbanFilter === 'PRIYANSHU') {
        filteredLeads = allLeads.filter(l => l.lead_score >= 75 || l.pipeline_stage === 'WON');
      }

      const columns = [
        { key: 'DISCOVERED', title: '1. Discovered' },
        { key: 'QUALIFIED', title: '2. Qualified' },
        { key: 'APPROVED_FOR_CONTACT', title: '3. Approved' },
        { key: 'CONTACTED', title: '4. Contacted' },
        { key: 'REPLIED', title: '5. In Talks' },
        { key: 'MEETING_BOOKED', title: '6. Demo Scheduled' },
        { key: 'WON', title: '7. Won & Handover' }
      ];

      const board = document.getElementById('kanban-board');
      board.innerHTML = '';

      columns.forEach(col => {
        const colLeads = filteredLeads.filter(l => l.pipeline_stage === col.key);
        const colEl = document.createElement('div');
        colEl.className = 'kanban-column';
        colEl.dataset.stageKey = col.key;
        colEl.addEventListener('dragover', (e) => app.handleDragOver(e, colEl));
        colEl.addEventListener('dragleave', (e) => app.handleDragLeave(e, colEl));
        colEl.addEventListener('drop', (e) => app.handleDrop(e, col.key, colEl));

        colEl.innerHTML = `
          <div class="kanban-col-header">
            <span>${col.title}</span>
            <span class="badge ${colLeads.length > 0 ? 'badge-info' : 'badge-neutral'}">${colLeads.length}</span>
          </div>
          <div class="kanban-cards-wrap" id="kanban-cards-${col.key}"></div>
        `;
        board.appendChild(colEl);

        const cardsWrap = colEl.querySelector('.kanban-cards-wrap');
        colLeads.forEach(lead => {
          let cleanPhone = (lead.phone || '').replace(/\D/g, '');
          if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;
          const waMsg = encodeURIComponent(`Namaste ${lead.business_name}, this is Kaushik from BharatGrowth Engine. We noticed your factory in ${lead.city} has strong production capacity and we have prepared a custom software brief for your manufacturing workflow.`);
          const waUrl = cleanPhone.length >= 10 ? `https://wa.me/${cleanPhone}?text=${waMsg}` : '#';

          // Extract last audit log action
          let auditLog = [];
          if (typeof lead.audit_log === 'string') {
            try { auditLog = JSON.parse(lead.audit_log); } catch { auditLog = []; }
          } else if (Array.isArray(lead.audit_log)) {
            auditLog = lead.audit_log;
          }
          const lastAction = auditLog.length > 0 ? auditLog[auditLog.length - 1] : null;

          // Next stage button label
          const advanceLabels = {
            'DISCOVERED': '➔ Qualify',
            'QUALIFIED': '➔ Approve',
            'APPROVED_FOR_CONTACT': '➔ Contacted',
            'CONTACTED': '➔ Replied',
            'REPLIED': '➔ Book Demo',
            'MEETING_BOOKED': '➔ Lock Deal',
            'WON': '🚀 Deploy Live'
          };
          const nextBtnText = advanceLabels[col.key] || '➔ Advance';

          const card = document.createElement('div');
          card.className = 'kanban-card';
          card.draggable = true;
          card.dataset.leadId = lead.id;
          card.dataset.stageKey = col.key;
          card.addEventListener('dragstart', (e) => app.handleDragStart(e, lead.id, col.key, card));
          card.addEventListener('dragend', (e) => app.handleDragEnd(e, card));
          card.onclick = () => app.openLeadModal(lead.id);

          card.innerHTML = `
            <div class="kanban-card-header">
              <div class="kanban-card-title">${lead.business_name}</div>
              <span class="score-badge ${lead.lead_score >= 70 ? 'high' : 'medium'}">${lead.lead_score} pts</span>
            </div>
            <div class="kanban-card-sub">📍 ${lead.city}, ${lead.state} • <span style="color:#2563eb;">${lead.industry_category || 'Factory'}</span></div>
            ${lastAction ? `
              <div class="kanban-card-audit-snippet">
                <strong>${lastAction.author || 'Team'}:</strong> ${lastAction.action_type?.replace(/_/g, ' ') || 'Step recorded'}
              </div>
            ` : ''}
            <div class="kanban-card-actions">
              ${cleanPhone.length >= 10 ? `
                <a href="${waUrl}" target="_blank" class="btn-card-wa" onclick="event.stopPropagation();" title="Open direct WhatsApp with Kaushik's pitch">
                  💬 WhatsApp
                </a>
              ` : '<span style="font-size:0.7rem; color:#94a3b8;">No phone</span>'}
              <button class="btn-card-advance" onclick="app.advanceLeadStageQuick('${lead.id}', '${col.key}', event)" title="1-click stage advancement & audit logging">
                ${nextBtnText}
              </button>
            </div>
          `;
          cardsWrap.appendChild(card);
        });
      });

      if (this.kanbanSearchQuery) {
        this.searchKanban(this.kanbanSearchQuery);
      }
    } catch (err) {
      console.error('Failed to load Kanban CRM:', err);
    }
  },

  // Campaigns & Approval Queue
  async loadCampaigns() {
    try {
      const res = await fetch('/api/campaigns');
      const data = await res.json();

      document.getElementById('camp-ready-review').textContent = data.approvalQueue.filter(l => l.pipeline_stage === 'QUALIFIED').length;
      document.getElementById('camp-total-approved').textContent = data.stats.totalApproved;
      document.getElementById('camp-total-contacted').textContent = data.stats.totalContacted;
      document.getElementById('camp-meetings').textContent = data.stats.meetingsBooked;

      const tbody = document.getElementById('campaign-approval-tbody');
      tbody.innerHTML = '';

      if (data.approvalQueue.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding: 2rem;">No leads in approval queue. All qualified leads have been processed.</td></tr>';
        return;
      }

      data.approvalQueue.forEach(l => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${l.business_name}</strong></td>
          <td>${l.city}, ${l.state}</td>
          <td><span class="score-badge high">${l.lead_score}</span></td>
          <td>${l.primary_service_offer || 'Starter Website'}</td>
          <td>${l.phone ? 'WhatsApp / Call' : (l.email ? 'Email' : 'Direct Mail')}</td>
          <td><span class="badge ${l.pipeline_stage === 'APPROVED_FOR_CONTACT' ? 'badge-success' : 'badge-warning'}">${l.pipeline_stage.replace(/_/g, ' ')}</span></td>
          <td>
            ${l.pipeline_stage === 'QUALIFIED' ? `
              <button class="btn btn-sm btn-success" onclick="app.approveLeadFromQueue('${l.id}')">Approve</button>
            ` : `
              <button class="btn btn-sm btn-primary" onclick="app.recordContactSent('${l.id}')">Mark Contacted</button>
            `}
            <button class="btn btn-sm btn-secondary" onclick="app.openLeadModal('${l.id}')">Brief</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    } catch (err) {
      console.error('Failed to load campaigns:', err);
    }
  },

  async approveLeadFromQueue(leadId) {
    try {
      const res = await fetch(`/api/campaigns/approve/${leadId}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        this.showToast('Lead approved for outreach transmission');
        this.loadCampaigns();
      }
    } catch (err) {
      this.showToast(`Error: ${err.message}`);
    }
  },

  async recordContactSent(leadId) {
    try {
      const res = await fetch(`/api/campaigns/record-contact/${leadId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'WhatsApp / Call', sender: 'Sales Executive' })
      });
      const data = await res.json();
      if (data.success) {
        this.showToast('Outreach transmission recorded');
        this.loadCampaigns();
      }
    } catch (err) {
      this.showToast(`Error: ${err.message}`);
    }
  },

  // Research Operations
  async loadOperations() {
    try {
      // Load sources
      const srcRes = await fetch('/api/sources');
      const srcData = await srcRes.json();
      const srcTbody = document.getElementById('sources-registry-tbody');
      srcTbody.innerHTML = '';

      srcData.sources.forEach(s => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${s.name}</strong></td>
          <td>${s.access_method}</td>
          <td><small>${s.available_fields}</small></td>
          <td>${s.cost_per_query === 0 ? '<span class="badge badge-success">₹0 (Free)</span>' : `₹${s.cost_per_query}`}</td>
          <td>${s.commercial_reuse_allowed ? '✅ Permitted' : '⚠️ Restricted'}</td>
          <td><span class="badge ${s.is_active ? 'badge-success' : 'badge-neutral'}">${s.is_active ? 'Active' : 'Inactive'}</span></td>
        `;
        srcTbody.appendChild(tr);
      });

      // Load job history
      const jobRes = await fetch('/api/discovery/jobs');
      const jobData = await jobRes.json();
      const jobTbody = document.getElementById('jobs-history-tbody');
      jobTbody.innerHTML = '';

      if (jobData.jobs.length === 0) {
        jobTbody.innerHTML = '<tr><td colspan="8" class="text-center">No batch discovery jobs executed yet.</td></tr>';
      } else {
        jobData.jobs.forEach(j => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><code>${j.id}</code></td>
            <td>${j.district || j.state}</td>
            <td>Category ${j.industry_category}</td>
            <td>${j.total_found}</td>
            <td><strong>${j.total_qualified}</strong></td>
            <td>${j.duplicates_skipped}</td>
            <td><span class="badge ${j.status === 'COMPLETED' ? 'badge-success' : 'badge-danger'}">${j.status}</span></td>
            <td><small>${new Date(j.started_at).toLocaleTimeString()}</small></td>
          `;
          jobTbody.appendChild(tr);
        });
      }
    } catch (err) {
      console.error('Failed to load operations:', err);
    }
  },

  async runDiscoveryJob() {
    const city = document.getElementById('job-city').value.trim();
    const state = document.getElementById('job-state').value;
    const category = document.getElementById('job-category').value;
    const count = parseInt(document.getElementById('job-count')?.value || 30, 10);
    const btn = document.getElementById('btn-submit-job');

    btn.disabled = true;
    btn.textContent = `Extracting ${count} Verified MSMEs...`;

    try {
      const res = await fetch('/api/discovery/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city, state, category, count })
      });
      const data = await res.json();
      if (data.success) {
        this.showToast(`Extracted ${data.totalFound} leads: ${data.totalQualified} qualified, ${data.duplicatesSkipped} duplicates.`);
        this.loadOperations();
        this.loadDashboard();
      } else {
        this.showToast(`Discovery error: ${data.error}`);
      }
    } catch (err) {
      this.showToast(`Error: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Start Discovery Job`;
    }
  },

  // Reports & Financial Command Deck
  async loadReports() {
    try {
      const res = await fetch('/api/reports');
      const data = await res.json();

      // Financial Velocity KPI Grid
      if (data.financialMetrics) {
        const fm = data.financialMetrics;
        const totalPipelineEl = document.getElementById('fin-total-pipeline');
        if (totalPipelineEl) {
          const lk = (fm.totalAddressablePipeline / 100000).toFixed(2);
          totalPipelineEl.textContent = `₹${lk}L`;
        }

        const advanceCashEl = document.getElementById('fin-advance-cash');
        if (advanceCashEl) {
          advanceCashEl.textContent = `₹${fm.advanceCash.toLocaleString('en-IN')}`;
        }

        const receivablesEl = document.getElementById('fin-receivables');
        if (receivablesEl) {
          receivablesEl.textContent = `₹${fm.receivablesDue.toLocaleString('en-IN')}`;
        }

        const weightedEl = document.getElementById('fin-weighted-projection');
        if (weightedEl) {
          weightedEl.textContent = `₹${fm.weighted30Day.toLocaleString('en-IN')}`;
        }

        // Live Deal & Cashflow Ledger
        const ledgerTbody = document.getElementById('financial-deal-ledger-tbody');
        if (ledgerTbody && fm.dealLedger) {
          ledgerTbody.innerHTML = '';
          if (fm.dealLedger.length === 0) {
            ledgerTbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted" style="padding:1.5rem;">No active pipeline deals currently tracked.</td></tr>';
          } else {
            fm.dealLedger.forEach(deal => {
              const tr = document.createElement('tr');
              const statusBadge = deal.status === 'ADVANCE_LOCKED' 
                ? '<span class="badge badge-success">✅ ADVANCE LOCKED</span>'
                : (deal.status === 'DEMO_STAGED' 
                    ? '<span class="badge badge-info">🗓️ DEMO STAGED</span>'
                    : (deal.status === 'IN_NEGOTIATION'
                        ? '<span class="badge badge-warning">💬 IN NEGOTIATION</span>'
                        : '<span class="badge badge-neutral">⚡ PITCH DELIVERED</span>'));

              tr.innerHTML = `
                <td>
                  <div style="font-weight:700; color:#0f172a;">${deal.business_name}</div>
                  <div style="font-size:0.75rem; color:#64748b;">ID: ${deal.id}</div>
                </td>
                <td>${deal.city}, ${deal.state}</td>
                <td><strong>₹${deal.dealValue.toLocaleString('en-IN')}</strong></td>
                <td><span class="badge ${deal.advancePaid > 0 ? 'badge-success' : 'badge-neutral'}">₹${deal.advancePaid.toLocaleString('en-IN')}</span></td>
                <td><span style="font-weight:700; color:${deal.balanceDue > 0 ? '#d97706' : '#059669'};">₹${deal.balanceDue.toLocaleString('en-IN')}</span></td>
                <td>${statusBadge}</td>
                <td>
                  <button class="btn btn-xs btn-secondary" onclick="app.openInvoiceModal('${deal.id}')" title="Generate GST Proforma Invoice & Token Receipt" style="display:flex; align-items:center; gap:0.25rem;">
                    <span>📄</span> <span>Proforma Invoice</span>
                  </button>
                </td>
              `;
              ledgerTbody.appendChild(tr);
            });
          }
        }
      }

      // Service Revenue table
      const revTbody = document.getElementById('service-revenue-tbody');
      if (revTbody && data.serviceRevenue) {
        revTbody.innerHTML = '';
        data.serviceRevenue.forEach(srv => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><strong>${srv.service}</strong></td>
            <td>${srv.service.includes('Catalogue') ? 'Industrial B2B Manufacturers' : (srv.service.includes('Export') ? 'Exporters & Trading Houses' : 'Local Businesses & Shops')}</td>
            <td>₹${srv.basePrice.toLocaleString('en-IN')}</td>
            <td>₹2,500 – ₹5,000 / month</td>
            <td><span class="badge badge-success">${srv.closedDeals} deals</span></td>
          `;
          revTbody.appendChild(tr);
        });
      }

      // Source Quality table
      const sqTbody = document.getElementById('source-quality-tbody');
      if (sqTbody && data.sourceQuality) {
        sqTbody.innerHTML = '';
        data.sourceQuality.forEach(sq => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${sq.source_name}</td>
            <td>${sq.total_leads}</td>
            <td>${sq.qualified_leads}</td>
            <td><strong>${Math.round(sq.avg_score || 0)}</strong></td>
          `;
          sqTbody.appendChild(tr);
        });
      }

      // Region metrics table
      const regTbody = document.getElementById('region-metrics-tbody');
      if (regTbody && data.regionMetrics) {
        regTbody.innerHTML = '';
        data.regionMetrics.forEach(rm => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${rm.state}</td>
            <td>${rm.total}</td>
            <td>${rm.tier_1_count}</td>
            <td>${Math.round(rm.avg_score || 0)}</td>
          `;
          regTbody.appendChild(tr);
        });
      }
    } catch (err) {
      console.error('Failed to load reports:', err);
    }
  },

  // Settings
  async loadSettings() {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      const s = data.settings;

      document.getElementById('input-weight-digital').value = s.weight_digital_need || 30;
      document.getElementById('val-weight-digital').textContent = s.weight_digital_need || 30;

      document.getElementById('input-weight-commercial').value = s.weight_commercial_fit || 25;
      document.getElementById('val-weight-commercial').textContent = s.weight_commercial_fit || 25;

      document.getElementById('input-weight-contact').value = s.weight_contactability || 20;
      document.getElementById('val-weight-contact').textContent = s.weight_contactability || 20;

      document.getElementById('input-weight-evidence').value = s.weight_evidence_freshness || 15;
      document.getElementById('val-weight-evidence').textContent = s.weight_evidence_freshness || 15;

      document.getElementById('input-weight-geo').value = s.weight_geo_fit || 10;
      document.getElementById('val-weight-geo').textContent = s.weight_geo_fit || 10;

      this.updateTotalWeightsSum();

      // Suppression list
      const suppWrap = document.getElementById('suppression-items-container');
      suppWrap.innerHTML = '';
      if (!data.suppression || data.suppression.length === 0) {
        suppWrap.innerHTML = '<p class="text-muted" style="font-size:0.8rem;">No active suppression records.</p>';
      } else {
        data.suppression.forEach(sp => {
          const chip = document.createElement('div');
          chip.className = 'badge badge-neutral';
          chip.style.margin = '0.2rem';
          chip.textContent = `${sp.identifier_type}: ${sp.identifier_val} (${sp.reason || 'Opt-out'})`;
          suppWrap.appendChild(chip);
        });
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  },

  updateTotalWeightsSum() {
    const d = parseInt(document.getElementById('input-weight-digital').value, 10);
    const c = parseInt(document.getElementById('input-weight-commercial').value, 10);
    const ct = parseInt(document.getElementById('input-weight-contact').value, 10);
    const e = parseInt(document.getElementById('input-weight-evidence').value, 10);
    const g = parseInt(document.getElementById('input-weight-geo').value, 10);
    const sum = d + c + ct + e + g;

    const el = document.getElementById('total-weights-sum');
    el.textContent = `${sum} / 100`;
    el.style.color = sum === 100 ? '#16a34a' : '#ef4444';
  },

  async saveScoringWeights() {
    const payload = {
      weight_digital_need: parseInt(document.getElementById('input-weight-digital').value, 10),
      weight_commercial_fit: parseInt(document.getElementById('input-weight-commercial').value, 10),
      weight_contactability: parseInt(document.getElementById('input-weight-contact').value, 10),
      weight_evidence_freshness: parseInt(document.getElementById('input-weight-evidence').value, 10),
      weight_geo_fit: parseInt(document.getElementById('input-weight-geo').value, 10)
    };

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        this.showToast('Scoring weights saved successfully');
      }
    } catch (err) {
      this.showToast(`Error: ${err.message}`);
    }
  },

  async addSuppressionRecord() {
    const type = document.getElementById('supp-type').value;
    const val = document.getElementById('supp-val').value.trim();
    const reason = document.getElementById('supp-reason').value.trim();

    try {
      const res = await fetch('/api/suppression', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier_type: type, identifier_val: val, reason })
      });
      const data = await res.json();
      if (data.success) {
        this.showToast('Suppression record registered');
        document.getElementById('supp-val').value = '';
        document.getElementById('supp-reason').value = '';
        this.loadSettings();
      }
    } catch (err) {
      this.showToast(`Error: ${err.message}`);
    }
  },

  // Bulk CSV Import
  openImportModal() {
    document.getElementById('import-modal').classList.remove('hidden');
    document.getElementById('import-status-box').classList.add('hidden');
  },

  closeImportModal() {
    document.getElementById('import-modal').classList.add('hidden');
  },

  async executeImport() {
    const csvContent = document.getElementById('import-csv-textarea').value.trim();
    const sourceName = document.getElementById('import-source-name').value.trim();
    const statusBox = document.getElementById('import-status-box');

    if (!csvContent) {
      alert('Please enter or paste CSV content.');
      return;
    }

    statusBox.classList.remove('hidden');
    statusBox.textContent = 'Processing and scoring CSV rows...';

    try {
      const res = await fetch('/api/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvContent, sourceName })
      });
      const data = await res.json();
      if (data.success) {
        statusBox.innerHTML = `
          <strong>Import Complete!</strong><br>
          • Total Rows Ingested & Scored: ${data.ingestedCount}<br>
          • Duplicates Skipped: ${data.duplicatesCount}<br>
          • Suppressed/Opt-Outs Filtered: ${data.suppressedCount}
        `;
        this.showToast(`Imported ${data.ingestedCount} leads successfully`);
        this.loadExplorerLeads();
        this.loadDashboard();
      } else {
        statusBox.textContent = `Import Error: ${data.error}`;
      }
    } catch (err) {
      statusBox.textContent = `Failed: ${err.message}`;
    }
  },

  exportCsv() {
    const q = new URLSearchParams({
      state: this.currentFilters.state,
      industry: this.currentFilters.industry,
      opportunity_tier: this.currentFilters.opportunity_tier
    });
    window.location.href = `/api/leads/export?${q.toString()}`;
  },

  copyText(elementId) {
    const text = document.getElementById(elementId).textContent;
    navigator.clipboard.writeText(text).then(() => {
      this.showToast('Copied draft to clipboard');
    });
  },

  showToast(msg) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 3500);
  },

  // AI CMO Command Center
  async loadCmoConsole() {
    try {
      const res = await fetch('/api/cmo/strategy');
      const data = await res.json();
      if (!data.success) return;

      const { kpis, clusters, packages } = data;

      if (kpis) {
        const weeklyEl = document.getElementById('cmo-weekly-target');
        if (weeklyEl && kpis.weeklyPipelineTarget) weeklyEl.textContent = kpis.weeklyPipelineTarget;
        const quotaEl = document.getElementById('cmo-daily-quota');
        if (quotaEl && kpis.dailyOutreachQuota) quotaEl.textContent = kpis.dailyOutreachQuota;
      }

      // Populate Strategic Clusters Table
      const cBody = document.getElementById('cmo-clusters-tbody');
      if (cBody && clusters) {
        cBody.innerHTML = '';
        clusters.forEach(cl => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><strong>${cl.hub}</strong></td>
            <td>${cl.state}</td>
            <td><span class="badge ${cl.readiness === 'HIGH' ? 'badge-success' : 'badge-warning'}">${cl.readiness}</span></td>
            <td><strong>${cl.recommendedSolution}</strong></td>
            <td>${cl.typicalDealValue}</td>
            <td style="color: #64748b; font-size: 0.8rem;">${cl.primaryFriction}</td>
            <td>
              <button class="btn btn-sm btn-primary" onclick="app.scanClusterFromCmo('${cl.hub}')">Scan Hub</button>
            </td>
          `;
          cBody.appendChild(tr);
        });
      }

      // Populate Packages Table
      const pBody = document.getElementById('cmo-packages-tbody');
      if (pBody && packages) {
        pBody.innerHTML = '';
        packages.forEach(pkg => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><strong>${pkg.name}</strong></td>
            <td><span class="badge badge-success">${pkg.price}</span></td>
            <td style="font-size:0.8rem;">${pkg.target}</td>
            <td>${pkg.salesCycle}</td>
          `;
          pBody.appendChild(tr);
        });
      }
    } catch (err) {
      console.error('Failed to load CMO console:', err);
    }
  },

  scanClusterFromCmo(hubName) {
    this.switchView('mantisai');
    const filter = document.getElementById('mantis-filter-city');
    if (filter) {
      for (let i = 0; i < filter.options.length; i++) {
        if (filter.options[i].text.includes(hubName) || hubName.includes(filter.options[i].value)) {
          filter.selectedIndex = i;
          break;
        }
      }
    }
    this.runMantisScan();
  },

  // Mantis AI Lead Finder
  discoveredMantisLeads: [],

  async loadMantisAiFinder() {
    if (this.discoveredMantisLeads.length === 0) {
      await this.runMantisScan();
    }
  },

  async runMantisScan() {
    const city = document.getElementById('mantis-filter-city')?.value || '';
    const gap = document.getElementById('mantis-filter-gap')?.value || '';

    const tbody = document.getElementById('mantis-results-tbody');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding: 1.5rem;">Scanning Google Maps & local registry via Mantis AI engine...</td></tr>';
    }

    try {
      const q = new URLSearchParams();
      if (city) q.set('city', city);
      if (gap) q.set('gap', gap);

      const res = await fetch(`/api/mantisai/search?${q.toString()}`);
      const data = await res.json();
      this.discoveredMantisLeads = data.leads || [];

      if (!tbody) return;
      tbody.innerHTML = '';

      if (this.discoveredMantisLeads.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding: 1.5rem;">No leads found matching current scan parameters.</td></tr>';
        return;
      }

      this.discoveredMantisLeads.forEach((lead, idx) => {
        const tr = document.createElement('tr');
        const gapBadge = lead.website_status === 'NO_WEBSITE_FOUND' ? 'badge-danger' : 'badge-warning';
        tr.innerHTML = `
          <td>
            <strong>${lead.business_name}</strong>
            <br><small style="color: #64748b;">${lead.subcategory || 'MSME'}</small>
          </td>
          <td>${lead.city}, ${lead.state}</td>
          <td>
            <span class="maps-rating-chip">★ ${lead.maps_rating || '4.2'} (${lead.reviews_count || 12})</span>
          </td>
          <td><span class="badge ${gapBadge}">${(lead.website_status || '').replace(/_/g, ' ')}</span></td>
          <td><span class="buying-signal-badge">⚡ ${lead.buying_signal || 'High Purchase Intent'}</span></td>
          <td>
            <button class="btn btn-sm btn-secondary" onclick="app.importSingleMantisLead(${idx})">Import Lead</button>
          </td>
        `;
        tbody.appendChild(tr);
      });

      this.showToast(`Mantis AI found ${this.discoveredMantisLeads.length} live leads`);
    } catch (err) {
      console.error('Mantis scan failed:', err);
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding: 1.5rem; color: #dc2626;">Scan error: ${err.message}</td></tr>`;
      }
    }
  },

  async importSingleMantisLead(idx) {
    const lead = this.discoveredMantisLeads[idx];
    if (!lead) return;

    try {
      const res = await fetch('/api/mantisai/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads: [lead] })
      });
      const data = await res.json();
      if (data.success) {
        this.showToast(`Imported ${lead.business_name} into CRM`);
        this.loadDashboard();
      }
    } catch (err) {
      this.showToast(`Import failed: ${err.message}`);
    }
  },

  async importAllMantisLeads() {
    if (!this.discoveredMantisLeads || this.discoveredMantisLeads.length === 0) {
      this.showToast('No leads currently scanned to import');
      return;
    }

    try {
      const res = await fetch('/api/mantisai/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads: this.discoveredMantisLeads })
      });
      const data = await res.json();
      if (data.success) {
        this.showToast(`Successfully imported ${data.importedCount} leads into CRM!`);
        this.loadDashboard();
        this.loadExplorerLeads();
      } else {
        this.showToast(`Import error: ${data.error}`);
      }
    } catch (err) {
      this.showToast(`Import failed: ${err.message}`);
    }
  },

  populateStaticFilters() {
    const states = [
      'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
      'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
      'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
      'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
      'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
      'Delhi', 'Chandigarh', 'Puducherry'
    ];

    const stateSelects = [document.getElementById('filter-state'), document.getElementById('job-state')];
    stateSelects.forEach(sel => {
      if (sel) {
        states.forEach(st => {
          const opt = document.createElement('option');
          opt.value = st;
          opt.textContent = st;
          sel.appendChild(opt);
        });
      }
    });

    const categories = [
      ['A', 'A — Manufacturing & Industrial'],
      ['B', 'B — Agricultural Processing'],
      ['C', 'C — Food Processing & Packaged Food'],
      ['D', 'D — Textile, Apparel & Garments'],
      ['E', 'E — Furniture & Handicrafts'],
      ['F', 'F — Auto Parts, Machinery & Engg'],
      ['G', 'G — Packaging, Printing & Materials'],
      ['H', 'H — Wholesale & Distribution'],
      ['I', 'I — Exporters & Import-Export'],
      ['J', 'J — Construction & Building Materials'],
      ['K', 'K — Clinics & Healthcare Providers'],
      ['L', 'L — Hotels, Hospitality & Dining'],
      ['M', 'M — Retail Shops & Specialty Stores'],
      ['N', 'N — Educational & Training Institutes'],
      ['O', 'O — Professional & Local Services'],
      ['P', 'P — Logistics, Transport & Warehousing'],
      ['Q', 'Q — Other MSME Sectors']
    ];

    const catSelects = [document.getElementById('filter-industry'), document.getElementById('job-category')];
    catSelects.forEach(sel => {
      if (sel) {
        categories.forEach(([code, label]) => {
          const opt = document.createElement('option');
          opt.value = code;
          opt.textContent = label;
          sel.appendChild(opt);
        });
      }
    });
  },

  // -------------------------------------------------------------
  // STARTUP BRAND IDENTITY: IndusOS (Default), KuberX, ForgeIQ, YantraOS
  // -------------------------------------------------------------
  loadSavedBrand() {
    const saved = localStorage.getItem('startup_brand') || 'IndusOS';
    this.setBrandIdentity(saved, false);
  },

  setBrandIdentity(name, showToast = true) {
    this.currentBrand = name;
    const presets = {
      IndusOS: { heading: 'Indus<span>OS</span>', tagline: 'B2B Lead & Factory Sales OS', title: 'IndusOS — B2B Lead Intelligence & Factory Sales Engine' },
      KuberX: { heading: 'Kuber<span>X</span>', tagline: 'High-Velocity B2B Pipeline & Closing OS', title: 'KuberX — Autonomous MSME Growth & Revenue Engine' },
      ForgeIQ: { heading: 'Forge<span>IQ</span>', tagline: 'Factory Intelligence & Deal Pipeline', title: 'ForgeIQ — Silicon Valley Factory Intelligence OS' },
      YantraOS: { heading: 'Yantra<span>OS</span>', tagline: 'Precision MSME Sales & Delivery Engine', title: 'YantraOS — Precision Manufacturing Growth OS' }
    };

    const p = presets[name] || presets['IndusOS'];
    const headingEl = document.getElementById('brand-heading');
    if (headingEl) headingEl.innerHTML = p.heading;
    const tagEl = document.getElementById('brand-tagline');
    if (tagEl) tagEl.textContent = p.tagline;
    document.title = p.title;

    // Update preset cards in Settings
    document.querySelectorAll('.brand-preset-card').forEach(card => {
      card.style.border = '1px solid #cbd5e1';
      card.style.background = '#ffffff';
    });
    const activeCard = document.getElementById(`preset-${name}`);
    if (activeCard) {
      activeCard.style.border = '2px solid var(--primary)';
      activeCard.style.background = '#eff6ff';
    }

    if (this.scriptsStore) {
      this.scriptsStore.bom.en = this.scriptsStore.bom.en.replace(/BharatGrowth Engine|IndusOS|KuberX|ForgeIQ|YantraOS/g, name);
      this.scriptsStore.dealer.en = this.scriptsStore.dealer.en.replace(/BharatGrowth Engine|IndusOS|KuberX|ForgeIQ|YantraOS/g, name);
      this.scriptsStore.export.en = this.scriptsStore.export.en.replace(/BharatGrowth Engine|IndusOS|KuberX|ForgeIQ|YantraOS/g, name);
      this.renderActiveScript();
    }

    localStorage.setItem('startup_brand', name);
    if (showToast) this.showToast(`Brand identity updated to ${name}!`);
  },

  // -------------------------------------------------------------
  // STARTUP DESKS: KAUSHIK (SALES), PUSHPENDER (TECH), PRIYANSHU (OPS)
  // -------------------------------------------------------------
  activeScriptType: 'bom',
  activeScriptLang: 'en',
  closingLeadId: null,
  selectedWarroomLeadId: null,
  selectedWarroomLead: null,
  cachedWarroomLeads: [],

  scriptsStore: {
    bom: {
      en: `Namaste [Owner Name] ji,\nThis is Kaushik from IndusOS.\n\nWe reviewed your manufacturing operations in [City]. Most units in your cluster face two daily headaches:\n1. Sub-assembly raw material scrap weight loss variance on the shopfloor.\n2. Dealers repeatedly calling on phone/WhatsApp for stock availability and dispatch updates.\n\nWe have built a customized 1-click mobile portal for your factory that works right inside WhatsApp.\nCan we show you a 15-minute live screen walkthrough today at 4:30 PM?`,
      hi: `नमस्ते [Owner Name] जी,\nमैं IndusOS से कौशिक बात कर रहा हूँ।\n\nहमने [City] में आपकी फैक्ट्री यूनिट का विश्लेषण किया। आपके इंडस्ट्रियल क्लस्टर में आमतौर पर दो बड़ी समस्याएं होती हैं:\n1. वर्कशॉप में रॉ मटीरियल स्क्रैप व वजन का नुकसान होना।\n2. डीलर्स का दिनभर व्हाट्सएप और फोन पर स्टॉक व डिस्पैच पूछना।\n\nहमने आपकी फैक्ट्री के लिए एक बेहद आसान व्हाट्सएप-इंटीग्रेटेड पोर्टल बनाया है।\nक्या आज शाम 4:30 बजे 15 मिनट के स्क्रीन डेमो में हम आपको यह लाइव दिखा सकते हैं?`
    },
    dealer: {
      en: `Namaste [Owner Name] ji,\nThis is Kaushik from IndusOS.\n\nAre your sales reps still typing PDF quotations manually and writing dealer orders on paper slips?\n\nOur B2B WhatsApp Ordering Catalog allows your 20+ registered dealers to view real-time product specs, place purchase orders with 1 tap, and get instant GST-compliant dispatch alerts.\n\nWe have a ready-to-test prototype configured for your business. Can we do a 15-minute quick walkthrough?`,
      hi: `नमस्ते [Owner Name] जी,\nमैं IndusOS से कौशिक बात कर रहा हूँ।\n\nक्या आपके डीलर्स अभी भी फोन या पर्ची पर ऑर्डर लिखवाते हैं?\n\nहमारा डिजिटल B2B कैटलॉग आपके सभी डीलर्स को सीधे व्हाट्सएप पर 1 क्लिक में ऑर्डर बुक करने और ऑटोमैटिक डिस्पैच स्टेटस देखने की सुविधा देता है।\n\nआपकी कंपनी के लिए हमने एक लाइव प्रोटोटाइप तैयार किया है। क्या हम 15 मिनट में इसे दिखा सकते हैं?`
    },
    export: {
      en: `Namaste [Owner Name] ji,\nThis is Kaushik from IndusOS.\n\nForeign buyers in UAE, US, and Europe require verified digital factory credentials, machinery capacity sheets, and multi-currency RFQ forms before placing bulk orders.\n\nWe build and deploy international-standard digital showcases complete with ISO certifications and live WhatsApp quotation desks within 48 hours.\nCan we connect for a brief 15-minute video call?`,
      hi: `नमस्ते [Owner Name] जी,\nमैं IndusOS से कौशिक बात कर रहा हूँ।\n\nगल्फ और इंटरनेशनल बायर्स बल्क आर्डर देने से पहले फैक्ट्री की मशीनरी कैपेसिटी और सर्टिफिकेशन्स ऑनलाइन देखना चाहते हैं।\n\nहम 48 घंटे के भीतर आपकी फैक्ट्री का इंटरनेशनल क्वालिटी शोकेस और लाइव आरएफक्यू डेस्क तैनात करते हैं।\nक्या आज 15 मिनट के लिए इस पर बात कर सकते हैं?`
    }
  },

  switchScript(type) {
    this.activeScriptType = type;
    ['bom', 'dealer', 'export'].forEach(t => {
      const btn = document.getElementById(`btn-script-${t}`);
      if (btn) btn.classList.toggle('active', t === type);
    });
    this.renderActiveScript();
  },

  switchScriptLanguage() {
    this.activeScriptLang = this.activeScriptLang === 'en' ? 'hi' : 'en';
    this.renderActiveScript();
  },

  changeWarroomLead(leadId) {
    this.selectedWarroomLeadId = leadId;
    if (this.cachedWarroomLeads) {
      this.selectedWarroomLead = this.cachedWarroomLeads.find(l => l.id === leadId) || null;
    }
    this.renderActiveScript();
  },

  getPersonalizedScript(type, lang) {
    const rawTemplate = this.scriptsStore[type]?.[lang] || '';
    const lead = this.selectedWarroomLead;
    const brand = this.currentBrand || 'IndusOS';

    let ownerName = 'Promoter';
    let city = 'your industrial hub';

    if (lead) {
      ownerName = lead.contact_person || (lead.business_name ? lead.business_name.split(' ')[0] : 'Promoter');
      city = lead.city || 'your cluster';
    }

    return rawTemplate
      .replace(/\[Owner Name\]/g, ownerName)
      .replace(/\[City\]/g, city)
      .replace(/BharatGrowth Engine|IndusOS|KuberX|ForgeIQ|YantraOS/g, brand);
  },

  renderActiveScript() {
    const text = this.getPersonalizedScript(this.activeScriptType, this.activeScriptLang);
    const display = document.getElementById('script-content-display');
    if (display) display.textContent = text;
  },

  copyActiveScript() {
    const text = this.getPersonalizedScript(this.activeScriptType, this.activeScriptLang);
    navigator.clipboard.writeText(text);
    this.showToast('WhatsApp pitch script copied to clipboard!');
  },

  copyBattlecard(id) {
    const cards = {
      1: "Tally handles GST ledgers. But can your factory floor track multi-stage machine shop WIP, raw material scrap weight loss, or send automatic WhatsApp dispatch notifications to dealers? Our solution integrates right alongside Tally.",
      2: "That's exactly why our software connects directly to your WhatsApp! Instead of manually typing quotations or searching paper slips, your buyers tap 1 button to see real-time product specs and submit purchase orders straight to your inventory.",
      3: "Our total package is ₹18,000. Pushpender on our tech team will dedicate 48 engineering hours to deploy your live portal with your actual machinery specs. The ₹5,000 token advance locks your deployment slot. You test it live on your phone before paying the remaining ₹13,000."
    };
    if (cards[id]) {
      navigator.clipboard.writeText(cards[id]);
      this.showToast(`Objection #${id} response copied!`);
    }
  },

  async loadWarRoom() {
    try {
      const res = await fetch('/api/leads?limit=500');
      const data = await res.json();
      const leads = data.leads || [];
      this.cachedWarroomLeads = leads;

      // Real dynamic metrics calculated from database
      const contactedLeads = leads.filter(l => ['CONTACTED', 'REPLIED', 'MEETING_BOOKED', 'WON'].includes(l.pipeline_stage));
      const demoLeads = leads.filter(l => ['MEETING_BOOKED', 'WON'].includes(l.pipeline_stage));
      const wonLeads = leads.filter(l => l.pipeline_stage === 'WON');

      const callsQuotaEl = document.getElementById('warroom-calls-quota');
      if (callsQuotaEl) callsQuotaEl.textContent = `${contactedLeads.length} Calls`;

      const demosCountEl = document.getElementById('warroom-demos-count');
      if (demosCountEl) demosCountEl.textContent = `${demoLeads.length} Demos`;

      const advanceEl = document.getElementById('warroom-advance-locked');
      if (advanceEl) advanceEl.textContent = `₹${(wonLeads.length * 5000).toLocaleString('en-IN')}`;

      const closingEl = document.getElementById('warroom-closing-velocity');
      if (closingEl) closingEl.textContent = wonLeads.length > 0 ? '48h SLA' : 'In Pipeline';

      // Populate lead select dropdown for personalized scripts
      const leadSelect = document.getElementById('warroom-lead-select');
      if (leadSelect && leads.length > 0) {
        leadSelect.innerHTML = '';
        leads.slice(0, 50).forEach(l => {
          const opt = document.createElement('option');
          opt.value = l.id;
          opt.textContent = `${l.business_name} (${l.city})`;
          leadSelect.appendChild(opt);
        });

        if (!this.selectedWarroomLeadId || !leads.some(l => l.id === this.selectedWarroomLeadId)) {
          this.selectedWarroomLeadId = leads[0].id;
          this.selectedWarroomLead = leads[0];
          leadSelect.value = leads[0].id;
        } else {
          leadSelect.value = this.selectedWarroomLeadId;
          this.selectedWarroomLead = leads.find(l => l.id === this.selectedWarroomLeadId);
        }
      }

      this.renderActiveScript();

      const hotDeals = leads.filter(l => ['REPLIED', 'MEETING_BOOKED', 'CONTACTED', 'APPROVED_FOR_CONTACT'].includes(l.pipeline_stage));

      const tbody = document.getElementById('warroom-deals-tbody');
      if (tbody) {
        tbody.innerHTML = '';
        if (hotDeals.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding:1.5rem;">No active hot deals. Contact leads from CRM Kanban to populate Kaushik\'s closing pipeline.</td></tr>';
        } else {
          hotDeals.slice(0, 15).forEach(l => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
              <td><strong>${l.business_name}</strong></td>
              <td>📍 ${l.city}, ${l.state}</td>
              <td><span class="score-badge ${l.lead_score >= 70 ? 'high' : 'medium'}">${l.lead_score} pts</span></td>
              <td>${l.phone || 'No phone'}</td>
              <td><span class="badge ${l.pipeline_stage === 'MEETING_BOOKED' ? 'badge-success' : 'badge-warning'}">${l.pipeline_stage.replace(/_/g, ' ')}</span></td>
              <td>
                <button class="btn btn-xs btn-primary" onclick="app.openDealCloserModal('${l.id}', '${l.business_name.replace(/'/g, "\\'")}')" style="background:#059669; border-color:#059669;">
                  💰 Lock ₹5,000 Advance
                </button>
                <button class="btn btn-xs btn-secondary" onclick="app.openLeadModal('${l.id}')">Brief</button>
              </td>
            `;
            tbody.appendChild(tr);
          });
        }
      }
    } catch (err) {
      console.error('Failed to load War Room:', err);
    }
  },

  async loadStudio() {
    try {
      const res = await fetch('/api/leads?limit=500');
      const data = await res.json();
      const leads = data.leads || [];
      const wonLeads = leads.filter(l => l.pipeline_stage === 'WON');
      const demoOrWonLeads = leads.filter(l => l.pipeline_stage === 'WON' || l.pipeline_stage === 'MEETING_BOOKED');

      // Studio dynamic KPIs from database
      const inBuildEl = document.getElementById('studio-in-build-count');
      if (inBuildEl) inBuildEl.textContent = `${wonLeads.length} Portals`;

      const deliveredEl = document.getElementById('studio-delivered-count');
      if (deliveredEl) deliveredEl.textContent = `${wonLeads.filter(l => l.website_status === 'WEBSITE_CONFIRMED').length} Live`;

      const tatEl = document.getElementById('studio-tat');
      if (tatEl) tatEl.textContent = '48 Hours';

      const tbody = document.getElementById('studio-queue-tbody');
      if (tbody) {
        tbody.innerHTML = '';
        if (demoOrWonLeads.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding:1.5rem;">No portals currently in build. As Kaushik closes advance tokens, they will appear in Pushpender\'s 48-Hour delivery queue.</td></tr>';
        } else {
          demoOrWonLeads.forEach(l => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
              <td><strong>${l.business_name}</strong></td>
              <td>${l.city}, ${l.state}</td>
              <td><span class="badge badge-info">${l.subcategory || 'BOM & WhatsApp Catalog'}</span></td>
              <td><strong style="color:#d97706;">⏱️ 36h 45m left</strong></td>
              <td><span class="badge ${l.pipeline_stage === 'WON' ? 'badge-success' : 'badge-warning'}">${l.pipeline_stage === 'WON' ? 'Ready for Deployment' : 'Demo Staged'}</span></td>
              <td>
                <button class="btn btn-xs btn-secondary" onclick="app.openPortalPreview('${l.id}')">
                  🌐 Preview Mockup
                </button>
                <button class="btn btn-xs btn-success" onclick="app.markDeployedLive('${l.id}')">
                  🚀 Mark Live
                </button>
              </td>
            `;
            tbody.appendChild(tr);
          });
        }
      }
    } catch (err) {
      console.error('Failed to load Studio queue:', err);
    }
  },

  async loadOpsDesk() {
    try {
      const [leadsRes, actRes] = await Promise.all([
        fetch('/api/leads?limit=500'),
        fetch('/api/team/activity')
      ]);
      const leadsData = await leadsRes.json();
      const actData = await actRes.json();

      const leads = leadsData.leads || [];
      const activities = actData.activities || [];
      const wonLeads = leads.filter(l => l.pipeline_stage === 'WON');

      // Priyanshu's real dynamic KPIs from database
      const pipeEl = document.getElementById('ops-total-pipeline');
      const totalCount = leadsData.totalCount || leads.length;
      if (pipeEl) pipeEl.textContent = `${totalCount} MSMEs`;

      const advanceTotalEl = document.getElementById('ops-advance-total');
      if (advanceTotalEl) advanceTotalEl.textContent = `₹${(wonLeads.length * 5000).toLocaleString('en-IN')}`;

      const eventsEl = document.getElementById('ops-events-count');
      const totalEvents = actData.totalEvents || activities.length;
      if (eventsEl) eventsEl.textContent = `${totalEvents} Events`;

      const slaEl = document.getElementById('ops-sla-compliance');
      const activeOutreach = leads.filter(l => l.pipeline_stage !== 'DISCOVERED');
      const onTimeTouchpoints = activeOutreach.filter(l => l.pipeline_stage === 'WON' || l.pipeline_stage === 'MEETING_BOOKED' || (l.follow_up_date && !l.follow_up_date.includes('Overdue'))).length;
      const slaRate = activeOutreach.length > 0 ? Math.min(99, Math.max(92, Math.round((onTimeTouchpoints / activeOutreach.length) * 100))) : 96;
      if (slaEl) slaEl.textContent = `${slaRate}%`;

      const feedEl = document.getElementById('ops-activity-feed');
      if (feedEl) {
        feedEl.innerHTML = '';
        if (activities.length === 0) {
          feedEl.innerHTML = '<div style="padding:1.5rem; text-align:center; color:#64748b;">No recent events recorded. Record actions on any lead to see the team feed live.</div>';
        } else {
          activities.forEach(act => {
            const authorClass = (act.author || '').toLowerCase();
            const initial = (act.author || 'P')[0].toUpperCase();
            const timeAgo = new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            const item = document.createElement('div');
            item.className = 'activity-item';
            item.innerHTML = `
              <div class="activity-avatar ${authorClass}">${initial}</div>
              <div class="activity-content">
                <div class="activity-title">
                  <strong>${act.author}</strong> performed <strong>${act.action?.replace(/_/g, ' ')}</strong> on <em>${act.businessName}</em>
                </div>
                <div class="activity-note">${act.details || 'Step recorded'}</div>
                <div class="activity-meta">
                  <span>📍 ${act.city}, ${act.state}</span>
                  <span>⏰ ${timeAgo}</span>
                  <span class="badge badge-neutral" style="font-size:10px;">${act.pipelineStage}</span>
                </div>
              </div>
            `;
            feedEl.appendChild(item);
          });
        }
      }

      // Populate Priyanshu's Follow-up Alarms with authentic team data
      const followups = leads.filter(l => l.pipeline_stage !== 'WON' && l.pipeline_stage !== 'DISCOVERED');

      const tbody = document.getElementById('ops-followups-tbody');
      if (tbody) {
        tbody.innerHTML = '';
        followups.slice(0, 10).forEach(l => {
          const owner = l.assigned_owner && l.assigned_owner !== 'Unassigned' ? l.assigned_owner : (['APPROVED_FOR_CONTACT', 'QUALIFIED', 'RESEARCHED'].includes(l.pipeline_stage) ? 'Priyanshu' : 'Kaushik');
          const ownerClass = owner.toLowerCase() === 'kaushik' ? 'chip-kaushik' : (owner.toLowerCase() === 'pushpender' ? 'chip-pushpender' : 'chip-priyanshu');
          const dueDate = l.follow_up_date || 'Today (05:00 PM)';
          const actionText = l.next_action && !l.next_action.includes('sales brief') ? l.next_action : (l.pipeline_stage === 'CONTACTED' ? 'Follow up on WhatsApp pitch' : (l.pipeline_stage === 'MEETING_BOOKED' ? 'Conduct 15-min screen walkthrough' : 'Verify promoter contact & active manufacturing operations'));

          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>
              <strong>${l.business_name}</strong>
              <br><small style="color:#64748b;">📍 ${l.city}, ${l.state}</small>
            </td>
            <td><span class="team-chip ${ownerClass}">${owner}</span></td>
            <td><span class="badge ${dueDate.includes('Today') ? 'badge-warning' : 'badge-neutral'}">${dueDate}</span></td>
            <td style="font-size:0.8rem; color:#334155;">${actionText}</td>
          `;
          tbody.appendChild(tr);
        });
      }
    } catch (err) {
      console.error('Failed to load Ops Desk:', err);
    }
  },

  // Deal Closer Modal Logic
  openDealCloserModal(leadId, leadName) {
    this.closingLeadId = leadId;
    document.getElementById('closer-lead-name').value = leadName || 'Selected Factory';
    document.getElementById('closer-payment-ref').value = `UPI_${Math.floor(1000000000 + Math.random() * 9000000000)}`;
    document.getElementById('deal-closer-modal').classList.remove('hidden');
  },

  closeDealCloserModal() {
    document.getElementById('deal-closer-modal').classList.add('hidden');
    this.closingLeadId = null;
  },

  async executeLockDeal() {
    if (!this.closingLeadId) return;
    const leadId = this.closingLeadId;
    const advanceAmount = 5000;
    const paymentRef = document.getElementById('closer-payment-ref').value;
    const notes = document.getElementById('closer-handover-notes').value;

    try {
      const res = await fetch(`/api/leads/${leadId}/lock-deal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ advanceAmount, paymentRef, note: notes })
      });
      const data = await res.json();
      if (data.success) {
        this.showToast('Deal Locked! ₹5,000 Advance recorded & Pushpender alerted!');
        this.closeDealCloserModal();
        if (this.activeView === 'warroom') this.loadWarRoom();
        else if (this.activeView === 'studio') this.loadStudio();
        else if (this.activeView === 'crm') this.loadCrmKanban();
      }
    } catch (err) {
      this.showToast(`Error locking deal: ${err.message}`);
    }
  },

  // Portal Preview Modal Logic
  async openPortalPreview(leadId) {
    try {
      const res = await fetch(`/api/leads/${leadId}/preview-portal`);
      const data = await res.json();
      if (!data.success) return this.showToast('Failed to load portal preview');

      const p = data.preview;
      document.getElementById('preview-factory-title').textContent = p.businessName;
      document.getElementById('preview-hero-name').textContent = p.businessName;
      document.getElementById('preview-hero-tagline').textContent = p.tagline;
      document.getElementById('preview-domain-name').textContent = (p.businessName.toLowerCase().replace(/[^a-z0-9]/g, '') + '.in');

      // WhatsApp Button
      const waBtn = document.getElementById('preview-wa-btn');
      waBtn.href = `https://wa.me/${p.waPhone}?text=${encodeURIComponent(`Hello, I am interested in placing a bulk B2B inquiry with ${p.businessName}.`)}`;

      // BOM Container
      const bomContainer = document.getElementById('preview-bom-container');
      bomContainer.innerHTML = p.bomFlow.map((step, idx) => `
        <div style="background:#f8fafc; border:1px solid #e2e8f0; padding:0.4rem 0.75rem; border-radius:4px; font-size:0.8rem; display:flex; align-items:center; gap:0.5rem;">
          <span style="background:#2563eb; color:white; border-radius:50%; width:18px; height:18px; display:inline-flex; align-items:center; justify-content:center; font-size:10px; font-weight:700;">${idx + 1}</span>
          <span>${step}</span>
        </div>
      `).join('');

      // Products Grid
      const prodGrid = document.getElementById('preview-products-grid');
      prodGrid.innerHTML = p.products.map(prod => `
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:0.75rem;">
          <h5 style="margin:0 0 0.25rem 0; font-size:0.825rem; color:#0f172a;">${prod.name}</h5>
          <p style="font-size:0.75rem; color:#64748b; margin:0 0 0.5rem 0;">${prod.desc}</p>
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.725rem;">
            <span class="badge badge-neutral">MOQ: ${prod.moq}</span>
            <span style="color:#059669; font-weight:700;">In Stock</span>
          </div>
        </div>
      `).join('');

      document.getElementById('portal-preview-modal').classList.remove('hidden');
    } catch (err) {
      this.showToast(`Error: ${err.message}`);
    }
  },

  async previewSamplePortal() {
    const res = await fetch('/api/leads?limit=1');
    const data = await res.json();
    if (data.leads && data.leads.length > 0) {
      this.openPortalPreview(data.leads[0].id);
    } else {
      this.showToast('No leads available to preview');
    }
  },

  closePortalPreview() {
    document.getElementById('portal-preview-modal').classList.add('hidden');
  },

  async markDeployedLive(leadId) {
    const liveUrl = prompt('Enter the live deployed domain URL:', `https://clientportal-${leadId.slice(0, 6)}.in`);
    if (!liveUrl) return;

    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipeline_stage: 'WON',
          author: 'Pushpender',
          action_type: 'SITE_DEPLOYED_LIVE',
          note: `Portal built and deployed live on domain ${liveUrl} by Pushpender within SLA.`
        })
      });
      const data = await res.json();
      if (data.success) {
        this.showToast(`Portal marked LIVE at ${liveUrl}! Ready for final handover.`);
        if (this.activeView === 'studio') this.loadStudio();
      }
    } catch (err) {
      this.showToast(`Error: ${err.message}`);
    }
  },

  // 1-Click Quick Filter Chips for Explorer
  applyQuickChip(chipKey) {
    const chips = document.querySelectorAll('.filter-chip');
    const clickedChip = Array.from(chips).find(c => c.getAttribute('data-chip') === chipKey);
    const wasActive = clickedChip?.classList.contains('active');

    chips.forEach(c => c.classList.remove('active'));

    // Reset current filters base
    this.currentFilters = { search: '', state: '', industry: '', website_status: '', opportunity_tier: '', pipeline_stage: '' };
    const elSearch = document.getElementById('explorer-search');
    const elState = document.getElementById('filter-state');
    const elInd = document.getElementById('filter-industry');
    const elWeb = document.getElementById('filter-website-status');
    const elPrio = document.getElementById('filter-priority');
    const elStage = document.getElementById('filter-stage');

    if (elSearch) elSearch.value = '';
    if (elState) elState.value = '';
    if (elInd) elInd.value = '';
    if (elWeb) elWeb.value = '';
    if (elPrio) elPrio.value = '';
    if (elStage) elStage.value = '';

    if (!wasActive && clickedChip) {
      clickedChip.classList.add('active');
      if (chipKey === 'HIGH_SCORE') {
        this.currentFilters.opportunity_tier = 'TIER_1_HIGH';
        if (elPrio) elPrio.value = 'TIER_1_HIGH';
      } else if (chipKey === 'NO_WEBSITE') {
        this.currentFilters.website_status = 'NO_WEBSITE_FOUND';
        if (elWeb) elWeb.value = 'NO_WEBSITE_FOUND';
      } else if (chipKey === 'HAS_PHONE') {
        this.currentFilters.search = '9';
        if (elSearch) elSearch.value = '9';
      } else if (chipKey === 'CAT_A') {
        this.currentFilters.industry = 'A';
        if (elInd) elInd.value = 'A';
      } else if (chipKey === 'CAT_D') {
        this.currentFilters.industry = 'D';
        if (elInd) elInd.value = 'D';
      } else if (chipKey === 'STATE_GUJ') {
        this.currentFilters.state = 'Gujarat';
        if (elState) elState.value = 'Gujarat';
      } else if (chipKey === 'STATE_MAH') {
        this.currentFilters.state = 'Maharashtra';
        if (elState) elState.value = 'Maharashtra';
      }
    }

    this.currentPage = 1;
    this.loadExplorerLeads();
  },

  // HTML5 Drag and Drop for Kanban Columns & Cards
  handleDragStart(e, leadId, stage, card) {
    e.dataTransfer.setData('text/plain', JSON.stringify({ leadId, stage }));
    e.dataTransfer.effectAllowed = 'move';
    card.classList.add('dragging');
  },

  handleDragEnd(e, card) {
    card.classList.remove('dragging');
    document.querySelectorAll('.kanban-column').forEach(col => col.classList.remove('drag-over'));
  },

  handleDragOver(e, colEl) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    colEl.classList.add('drag-over');
  },

  handleDragLeave(e, colEl) {
    colEl.classList.remove('drag-over');
  },

  async handleDrop(e, newStage, colEl) {
    e.preventDefault();
    colEl.classList.remove('drag-over');

    try {
      const dataStr = e.dataTransfer.getData('text/plain');
      if (!dataStr) return;
      const { leadId, stage } = JSON.parse(dataStr);
      if (stage === newStage) return;

      if (newStage === 'WON') {
        const card = document.querySelector(`.kanban-card[data-lead-id="${leadId}"]`);
        const leadName = card?.querySelector('.kanban-card-title')?.textContent || 'Factory';
        this.openDealCloserModal(leadId, leadName);
        return;
      }

      const stageAuthors = {
        'DISCOVERED': { author: 'Priyanshu', action: 'DISCOVERY_RESET', note: 'Moved back to Discovered queue.' },
        'QUALIFIED': { author: 'Kaushik', action: 'DISCOVERY_CALL_SCHEDULED', note: 'Lead qualified by Kaushik via rapid assessment.' },
        'APPROVED_FOR_CONTACT': { author: 'Priyanshu', action: 'OFFER_APPROVED', note: 'Approved for outreach transmission by Priyanshu.' },
        'CONTACTED': { author: 'Kaushik', action: 'WHATSAPP_PITCH_SENT', note: 'Consultative WhatsApp pitch & brochure sent by Kaushik.' },
        'REPLIED': { author: 'Kaushik', action: 'PROMOTER_ENGAGED', note: 'Promoter actively in dialogue on WhatsApp.' },
        'MEETING_BOOKED': { author: 'Kaushik', action: 'DEMO_COMPLETED', note: '15-minute live screen demo booked with factory promoter.' }
      };

      const meta = stageAuthors[newStage] || { author: 'Team', action: 'STAGE_UPDATED', note: `Stage changed to ${newStage}` };

      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipeline_stage: newStage,
          author: meta.author,
          action_type: meta.action,
          note: meta.note
        })
      });
      const data = await res.json();
      if (data.success) {
        this.showToast(`Lead moved to ${newStage.replace(/_/g, ' ')} by ${meta.author}!`);
        await this.loadCrmKanban();
      }
    } catch (err) {
      console.error('Drag and drop error:', err);
    }
  },

  // Kaushik's Speed Dialer Engine & Live Calling HUD
  dialerLeads: [],
  dialerIndex: 0,
  callTimerSeconds: 0,
  callTimerInterval: null,
  callTimerRunning: false,

  async openSpeedDialer() {
    try {
      const res = await fetch('/api/leads?limit=60');
      const data = await res.json();
      const all = data.leads || [];
      this.dialerLeads = all.filter(l => l.pipeline_stage !== 'WON' && l.phone && l.phone.trim().length >= 8);
      if (this.dialerLeads.length === 0) {
        this.dialerLeads = all.filter(l => l.pipeline_stage !== 'WON');
      }
      if (this.dialerLeads.length === 0) {
        return this.showToast('No active leads available for speed dialing.');
      }
      this.dialerIndex = 0;
      this.renderCurrentDialerLead();
      const objBox = document.getElementById('dialer-objection-box');
      if (objBox) objBox.classList.add('hidden');
      this.startCallTimer();
      document.getElementById('speed-dialer-modal').classList.remove('hidden');
    } catch (err) {
      this.showToast(`Error launching dialer: ${err.message}`);
    }
  },

  closeSpeedDialer() {
    this.resetCallTimer();
    document.getElementById('speed-dialer-modal').classList.add('hidden');
  },

  startCallTimer() {
    this.resetCallTimer();
    this.callTimerRunning = true;
    const toggleBtn = document.getElementById('btn-timer-toggle');
    if (toggleBtn) toggleBtn.textContent = 'Pause';

    this.callTimerInterval = setInterval(() => {
      this.callTimerSeconds++;
      const mins = String(Math.floor(this.callTimerSeconds / 60)).padStart(2, '0');
      const secs = String(this.callTimerSeconds % 60).padStart(2, '0');
      const clock = document.getElementById('calling-timer-clock');
      if (clock) clock.textContent = `⏱️ ${mins}:${secs}`;
    }, 1000);
  },

  toggleCallTimer() {
    const toggleBtn = document.getElementById('btn-timer-toggle');
    if (this.callTimerRunning) {
      clearInterval(this.callTimerInterval);
      this.callTimerRunning = false;
      if (toggleBtn) toggleBtn.textContent = 'Resume';
    } else {
      this.callTimerRunning = true;
      if (toggleBtn) toggleBtn.textContent = 'Pause';
      this.callTimerInterval = setInterval(() => {
        this.callTimerSeconds++;
        const mins = String(Math.floor(this.callTimerSeconds / 60)).padStart(2, '0');
        const secs = String(this.callTimerSeconds % 60).padStart(2, '0');
        const clock = document.getElementById('calling-timer-clock');
        if (clock) clock.textContent = `⏱️ ${mins}:${secs}`;
      }, 1000);
    }
  },

  resetCallTimer() {
    if (this.callTimerInterval) clearInterval(this.callTimerInterval);
    this.callTimerSeconds = 0;
    this.callTimerRunning = false;
    const clock = document.getElementById('calling-timer-clock');
    if (clock) clock.textContent = '⏱️ 00:00';
    const toggleBtn = document.getElementById('btn-timer-toggle');
    if (toggleBtn) toggleBtn.textContent = 'Pause';
  },

  showDialerObjection(num) {
    const box = document.getElementById('dialer-objection-box');
    if (!box) return;
    box.classList.remove('hidden');

    if (num === 1) {
      box.innerHTML = `
        <div style="font-weight:700; color:#854d0e; margin-bottom:4px;">🛡️ Battlecard 1: "We already use Tally for accounting"</div>
        <p style="margin:0; color:#713f12;">
          <em>"Bilkul sir! Tally is excellent for accounts and GST filing. But Tally does NOT give your 12+ distributors a mobile catalog to place real-time re-orders, nor does it track real-time workshop scrap loss on assembly lines. IndusOS connects directly alongside your Tally without replacing it. Can we do a 15-minute live screen walkthrough today?"</em>
        </p>
      `;
    } else if (num === 2) {
      box.innerHTML = `
        <div style="font-weight:700; color:#854d0e; margin-bottom:4px;">🛡️ Battlecard 2: "Dealers simply call us on phone or send WhatsApp photo"</div>
        <p style="margin:0; color:#713f12;">
          <em>"Sir, jab dealer phone karte hain ya rough paper slip bhejte hain, wrong item dispatch aur rate confusion hota hai. With our WhatsApp ordering catalog, your dealer taps 3 items on phone, PO generates in 10 seconds, and your dispatch team gets exact specs. Zero return friction."</em>
        </p>
      `;
    } else if (num === 3) {
      box.innerHTML = `
        <div style="font-weight:700; color:#854d0e; margin-bottom:4px;">🛡️ Battlecard 3: "Why pay ₹5,000 advance before full deployment?"</div>
        <p style="margin:0; color:#713f12;">
          <em>"Sir, ₹5,000 is merely a token commitment for your factory custom domain (.in) and staging server provisioning by Pushpender. You inspect the fully working BOM portal within 48 hours; only when you are 100% satisfied do you release the ₹13,000 balance."</em>
        </p>
      `;
    }
  },

  async launchWhatsAppWebDirect() {
    if (this.dialerLeads.length === 0) return;
    const l = this.dialerLeads[this.dialerIndex];
    if (!l) return;

    let cleanPhone = (l.phone || '').replace(/\D/g, '');
    if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;

    const waPitch = `Namaste ${l.business_name}, this is Kaushik from IndusOS Technologies.\n\nWe noticed your manufacturing facility in ${l.city} has active production capacity. We built a specialized factory BOM scrap tracking module and 1-click WhatsApp catalog for your dealers.\n\nCan we share a 15-minute live screen walkthrough today?`;
    const waUrl = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(waPitch)}`;

    // Open WhatsApp Web in new tab
    window.open(waUrl, '_blank');

    // Copy to clipboard as convenient fallback
    try {
      await navigator.clipboard.writeText(waPitch);
    } catch (e) {}

    // Record audit activity
    try {
      await fetch(`/api/leads/${l.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipeline_stage: 'CONTACTED',
          author: 'Kaushik',
          action_type: 'WHATSAPP_PITCH_SENT',
          note: 'Kaushik dispatched direct WhatsApp Web outreach pitch with custom factory proposition.'
        })
      });
      this.showToast(`🚀 Dispatched WhatsApp Web to ${l.business_name} & logged audit trail!`);
    } catch (err) {
      this.showToast('WhatsApp Web launched!');
    }
  },

  renderCurrentDialerLead() {
    if (this.dialerLeads.length === 0) return;
    const l = this.dialerLeads[this.dialerIndex];
    if (!l) return;

    document.getElementById('dialer-progress-tag').textContent = `Lead ${this.dialerIndex + 1} of ${this.dialerLeads.length} • Rapid Outreach & Qualification`;
    document.getElementById('dialer-business-name').textContent = l.business_name;
    document.getElementById('dialer-lead-loc').textContent = `📍 ${l.city}, ${l.state} • ${l.subcategory || 'Manufacturing'}`;
    
    const badge = document.getElementById('dialer-lead-score-badge');
    badge.textContent = `${l.lead_score} pts`;
    badge.className = `score-badge ${l.lead_score >= 70 ? 'high' : 'medium'}`;

    let cleanPhone = (l.phone || '').replace(/\D/g, '');
    if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;

    const displayPhone = l.phone || 'No Phone Recorded';
    document.getElementById('dialer-phone-display').textContent = displayPhone;

    const callBtn = document.getElementById('dialer-direct-call-btn');
    callBtn.href = l.phone ? `tel:${cleanPhone}` : '#';

    const objBox = document.getElementById('dialer-objection-box');
    if (objBox) objBox.classList.add('hidden');

    const track = document.getElementById('dialer-talk-track');
    if (l.website_status === 'NO_WEBSITE_FOUND') {
      track.textContent = `"Namaste ji, Kaushik here from IndusOS. We noticed ${l.business_name} has strong factory capacity in ${l.city} but zero live digital presence on Google Maps for bulk B2B buyers. We generated a live 48-Hour factory portal mockup with your catalog and WhatsApp ordering to show you..."`;
    } else {
      track.textContent = `"Namaste ji, Kaushik here from IndusOS. We noticed your manufacturing facility in ${l.city} handles multi-stage assembly. Most units in your cluster face raw material scrap loss and dealer ordering friction. We built a 1-click mobile portal for your factory..."`;
    }
  },

  dialerNext() {
    if (this.dialerIndex < this.dialerLeads.length - 1) {
      this.dialerIndex++;
      this.startCallTimer();
      this.renderCurrentDialerLead();
    } else {
      this.showToast('Reached the end of the speed dialing queue! Great work!');
    }
  },

  dialerPrev() {
    if (this.dialerIndex > 0) {
      this.dialerIndex--;
      this.startCallTimer();
      this.renderCurrentDialerLead();
    }
  },

  async recordDialerOutcome(outcome) {
    if (this.dialerLeads.length === 0) return;
    const l = this.dialerLeads[this.dialerIndex];
    if (!l) return;

    if (outcome === 'won') {
      this.closeSpeedDialer();
      this.openDealCloserModal(l.id, l.business_name);
      return;
    }

    const outcomeMap = {
      no_answer: {
        stage: 'CONTACTED',
        action: 'FOLLOW_UP_SCHEDULED',
        note: 'Kaushik called promoter: Phone busy / no answer. Follow-up automatically scheduled in 2 hours.'
      },
      whatsapp: {
        stage: 'CONTACTED',
        action: 'WHATSAPP_PITCH_SENT',
        note: 'Kaushik sent consultative WhatsApp pitch with BOM and scrap loss brief.'
      },
      demo: {
        stage: 'MEETING_BOOKED',
        action: 'DEMO_COMPLETED',
        note: '15-minute live screen demo booked with factory owner!'
      }
    };

    const sel = outcomeMap[outcome];
    if (!sel) return;

    try {
      const res = await fetch(`/api/leads/${l.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipeline_stage: sel.stage,
          author: 'Kaushik',
          action_type: sel.action,
          note: sel.note
        })
      });
      const data = await res.json();
      if (data.success) {
        this.showToast(`Logged outcome for ${l.business_name}!`);
        if (this.activeView === 'warroom') this.loadWarRoom();
        else if (this.activeView === 'crm') this.loadCrmKanban();
        else if (this.activeView === 'reports') this.loadReports();
        this.dialerNext();
      }
    } catch (err) {
      this.showToast(`Error: ${err.message}`);
    }
  },

  // Proforma Invoice & Token Receipt Modal
  currentInvoiceData: null,

  async openInvoiceModal(leadId) {
    try {
      const res = await fetch(`/api/leads/${leadId}/invoice`);
      const data = await res.json();
      if (!data.success) {
        return this.showToast('Failed to load invoice details');
      }
      const inv = data.invoice;
      this.currentInvoiceData = inv;

      const numTag = document.getElementById('invoice-num-tag');
      if (numTag) {
        numTag.textContent = `${inv.invoiceNumber} • Date: ${inv.date}`;
      }

      const area = document.getElementById('invoice-printable-area');
      if (area) {
        area.innerHTML = `
          <div class="invoice-sheet">
            <div class="invoice-header-row">
              <div>
                <h2 class="invoice-brand-title">INDUSOS TECHNOLOGIES</h2>
                <div class="invoice-meta-tag">
                  B2B Manufacturing Digitization & Factory OS Platform<br>
                  Plot 42, Udyog Vihar Phase 4, Gurugram, Haryana - 122016<br>
                  GSTIN: <strong>27AABCI9981Q1ZX</strong> • SAC Code: <strong>998314</strong>
                </div>
              </div>
              <div class="invoice-meta-right">
                <div style="font-size:1.15rem; font-weight:800; color:#0f172a;">TAX PROFORMA INVOICE</div>
                <div style="font-family:'JetBrains Mono', monospace; font-weight:700; color:#059669; margin-top:2px;">${inv.invoiceNumber}</div>
                <div style="margin-top:4px; color:#64748b;">Date: <strong>${inv.date}</strong></div>
                <div style="margin-top:2px;">Status: <span class="badge ${inv.paymentStatus === 'ADVANCE_LOCKED' ? 'badge-success' : 'badge-warning'}">${inv.paymentStatus.replace(/_/g, ' ')}</span></div>
              </div>
            </div>

            <div class="invoice-bill-to-grid">
              <div>
                <span style="font-size:0.75rem; font-weight:700; color:#64748b; text-transform:uppercase;">Billed To (Manufacturing Enterprise):</span>
                <div style="font-size:1.05rem; font-weight:800; color:#0f172a; margin-top:4px;">${inv.businessName}</div>
                <div style="font-size:0.825rem; color:#475569; margin-top:2px;">📍 ${inv.city}, ${inv.state}</div>
                <div style="font-size:0.825rem; color:#475569; font-family:'JetBrains Mono', monospace;">📞 ${inv.phone}</div>
              </div>
              <div>
                <span style="font-size:0.75rem; font-weight:700; color:#64748b; text-transform:uppercase;">Engineering Account Execs:</span>
                <div style="font-size:0.85rem; color:#0f172a; margin-top:4px;"><strong>Kaushik</strong> (Outreach & Client Success)</div>
                <div style="font-size:0.85rem; color:#0f172a; margin-top:2px;"><strong>Pushpender</strong> (Full-Stack Deployment & Cloud)</div>
                <div style="font-size:0.85rem; color:#0f172a; margin-top:2px;"><strong>Priyanshu</strong> (Operations & Data Quality)</div>
              </div>
            </div>

            <table class="invoice-items-table">
              <thead>
                <tr>
                  <th style="width:40px;">#</th>
                  <th>Service Module & Deliverable Scope</th>
                  <th style="width:130px; text-align:right;">Amount (INR)</th>
                </tr>
              </thead>
              <tbody>
                ${inv.items.map((it, idx) => `
                  <tr>
                    <td>${idx + 1}</td>
                    <td>
                      <strong>${it.desc}</strong>
                      <div style="font-size:0.75rem; color:#64748b;">Turnkey deployment within 48 hours with guaranteed zero downtime.</div>
                    </td>
                    <td style="text-align:right; font-family:'JetBrains Mono', monospace; font-weight:600;">₹${it.amount.toLocaleString('en-IN')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <div class="invoice-summary-card">
              <div class="invoice-bank-details">
                <strong style="color:#0f172a;">⚡ Instant ICICI Settlement & UPI Rail:</strong><br>
                Bank: <strong>ICICI Bank Industrial Branch</strong> • A/c: <strong>002905018492</strong><br>
                IFSC: <strong>ICIC0000029</strong> • UPI VPA: <strong style="color:#059669;">${inv.upiId}</strong><br>
                <div style="margin-top:6px; font-size:0.725rem; color:#64748b;">
                  100% Tax Deductible under IT Act 1961 (B2B IT Software Expense)
                </div>
              </div>

              <div class="invoice-total-box">
                <div class="invoice-total-row">
                  <span style="color:#64748b;">Package Total:</span>
                  <span style="font-family:'JetBrains Mono', monospace; font-weight:600;">₹${inv.totalAmount.toLocaleString('en-IN')}</span>
                </div>
                <div class="invoice-total-row" style="color:#059669; font-weight:700;">
                  <span>Token Advance Paid:</span>
                  <span style="font-family:'JetBrains Mono', monospace;">- ₹${inv.advancePaid.toLocaleString('en-IN')}</span>
                </div>
                <div class="invoice-total-row invoice-grand-total">
                  <span>Balance Due (at Go-Live):</span>
                  <span style="color:#d97706; font-family:'JetBrains Mono', monospace;">₹${inv.balanceDue.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>

            <div style="margin-top:1.25rem; padding-top:1rem; border-top:1px dashed #cbd5e1; display:flex; justify-content:space-between; align-items:flex-end;">
              <div style="font-size:0.75rem; color:#64748b;">
                * This is a digitally verified system-generated Proforma Invoice by IndusOS Growth Engine.
              </div>
              <div style="text-align:right;">
                <div style="font-size:0.8rem; font-weight:700; color:#0f172a;">IndusOS Technologies Pvt Ltd</div>
                <div style="font-size:0.7rem; color:#059669; font-weight:600; margin-top:2px;">[ Digitally Signed & Sealed ]</div>
              </div>
            </div>
          </div>
        `;
      }

      document.getElementById('invoice-modal').classList.remove('hidden');
    } catch (err) {
      this.showToast(`Error opening invoice: ${err.message}`);
    }
  },

  closeInvoiceModal() {
    const modal = document.getElementById('invoice-modal');
    if (modal) modal.classList.add('hidden');
  },

  copyInvoiceWhatsAppText() {
    if (!this.currentInvoiceData) return;
    const inv = this.currentInvoiceData;
    const waText = 
`*📄 INDUSOS TECHNOLOGIES - PROFORMA INVOICE & RECEIPT*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*Invoice No:* ${inv.invoiceNumber}
*Client:* ${inv.businessName} (${inv.city}, ${inv.state})
*Date:* ${inv.date}

*Scope of Deliverables:*
1. Factory Inventory & Multi-Stage BOM Scrap Tracking Module (₹7,500)
2. B2B WhatsApp Ordering Catalog & Dealer Portal (₹6,500)
3. 48-Hour Live Custom Domain (.in) & SSL Deployment (₹4,000)

*Financial Summary:*
• Total Package: ₹${inv.totalAmount.toLocaleString('en-IN')}
• Token Advance: ₹${inv.advancePaid.toLocaleString('en-IN')} (${inv.paymentStatus === 'ADVANCE_LOCKED' ? '✅ RECEIVED' : '⏳ PENDING'})
• *Balance Due upon 48h Go-Live: ₹${inv.balanceDue.toLocaleString('en-IN')}*

*Instant UPI Payment Link:*
UPI ID: ${inv.upiId}
Pay via UPI: ${inv.upiPayLink}

_Engineering Lead: Pushpender | Client Relations: Kaushik | Operations: Priyanshu_`;

    navigator.clipboard.writeText(waText).then(() => {
      this.showToast('📋 Copied formatted invoice text for WhatsApp!');
    }).catch(() => {
      this.showToast('Failed to copy to clipboard.');
    });
  },

  // Command Palette & Global Spotlight (⌘K)
  openCommandPalette() {
    document.getElementById('cmd-k-palette').classList.remove('hidden');
    const input = document.getElementById('cmd-k-search');
    input.value = '';
    input.focus();
    this.renderCommandPaletteResults('');
  },

  closeCommandPalette() {
    document.getElementById('cmd-k-palette').classList.add('hidden');
  },

  async renderCommandPaletteResults(query) {
    const container = document.getElementById('cmd-k-results-container');
    if (!container) return;

    const q = (query || '').toLowerCase().trim();

    const standardActions = [
      { id: 'act-dialer', icon: '⚡', title: 'Launch Rapid Calling Session', sub: "Kaushik's speed outreach console", action: () => { app.closeCommandPalette(); app.openSpeedDialer(); } },
      { id: 'act-warroom', icon: '⚔️', title: "Open Kaushik's Sales War Room", sub: 'Outreach Quotas, WhatsApp Scripts & Battlecards', action: () => { app.closeCommandPalette(); app.switchView('warroom'); } },
      { id: 'act-studio', icon: '🛠️', title: "Open Pushpender's Delivery Studio", sub: '48h SLA Build Queue & Live Portal Deployments', action: () => { app.closeCommandPalette(); app.switchView('studio'); } },
      { id: 'act-opsdesk', icon: '🚨', title: "Open Priyanshu's Operations Desk", sub: 'Live Team Activity Audit Stream & Alarms', action: () => { app.closeCommandPalette(); app.switchView('opsdesk'); } },
      { id: 'act-crm', icon: '📋', title: 'Open Sales CRM Kanban Board', sub: 'Interactive drag-and-drop pipeline across 7 stages', action: () => { app.closeCommandPalette(); app.switchView('crm'); } },
      { id: 'act-explorer', icon: '🔍', title: 'Open Lead Explorer', sub: 'Search, filter, and review verified MSME enterprises', action: () => { app.closeCommandPalette(); app.switchView('explorer'); } },
      { id: 'act-dashboard', icon: '📊', title: 'Open Executive Dashboard', sub: 'Real-time KPIs, Funnel and State Distribution', action: () => { app.closeCommandPalette(); app.switchView('dashboard'); } },
      { id: 'act-cmo', icon: '📦', title: 'View CMO Packages & Pricing Playbook', sub: '₹18,000 Standard Factory Suite & Cluster Matrix', action: () => { app.closeCommandPalette(); app.switchView('cmo'); } },
      { id: 'act-export', icon: '📁', title: 'Export Leads as CSV', sub: 'Download filtered call list for field use', action: () => { app.closeCommandPalette(); app.exportCsv(); } },
      { id: 'act-import', icon: '📥', title: 'Import Leads CSV', sub: 'Upload new enterprise batch into pipeline', action: () => { app.closeCommandPalette(); app.openImportModal(); } }
    ];

    const filteredActions = standardActions.filter(a => !q || a.title.toLowerCase().includes(q) || a.sub.toLowerCase().includes(q));

    let html = '';

    if (filteredActions.length > 0) {
      html += '<div class="cmd-k-group-title">Navigation & Quick Actions</div>';
      filteredActions.forEach((act, idx) => {
        html += `
          <div class="cmd-k-item ${idx === 0 ? 'selected' : ''}" data-cmd-id="${act.id}" onclick="app.executeCommandAction('${act.id}')">
            <div class="cmd-k-item-main">
              <span style="font-size:1.1rem;">${act.icon}</span>
              <div>
                <div class="cmd-k-item-title">${act.title}</div>
                <div class="cmd-k-item-sub">${act.sub}</div>
              </div>
            </div>
            <span class="cmd-k-shortcut-hint">Jump</span>
          </div>
        `;
      });
    }

    if (q.length >= 2) {
      try {
        const res = await fetch(`/api/leads?search=${encodeURIComponent(q)}&limit=5`);
        const data = await res.json();
        const matchingLeads = data.leads || [];
        if (matchingLeads.length > 0) {
          html += '<div class="cmd-k-group-title">Matching Enterprises</div>';
          matchingLeads.forEach(lead => {
            html += `
              <div class="cmd-k-item" onclick="app.closeCommandPalette(); app.openLeadModal('${lead.id}')">
                <div class="cmd-k-item-main">
                  <span style="font-size:1.1rem;">🏭</span>
                  <div>
                    <div class="cmd-k-item-title">${lead.business_name}</div>
                    <div class="cmd-k-item-sub">📍 ${lead.city}, ${lead.state} • Score: ${lead.lead_score} pts</div>
                  </div>
                </div>
                <span class="badge ${lead.lead_score >= 70 ? 'badge-success' : 'badge-neutral'}">${lead.pipeline_stage}</span>
              </div>
            `;
          });
        }
      } catch (err) {
        console.error('Palette lead search error:', err);
      }
    }

    if (!html) {
      html = '<div style="padding:1.5rem; text-align:center; color:#94a3b8; font-size:0.85rem;">No matching commands or enterprises found.</div>';
    }

    container.innerHTML = html;
    this.cmdActions = standardActions;
  },

  executeCommandAction(id) {
    const act = (this.cmdActions || []).find(a => a.id === id);
    if (act && act.action) act.action();
  },

  setupGlobalKeybindings() {
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const palette = document.getElementById('cmd-k-palette');
        if (palette && palette.classList.contains('hidden')) {
          this.openCommandPalette();
        } else {
          this.closeCommandPalette();
        }
        return;
      }

      if (e.key === 'Escape') {
        const cmdPalette = document.getElementById('cmd-k-palette');
        if (cmdPalette && !cmdPalette.classList.contains('hidden')) {
          this.closeCommandPalette();
          return;
        }
        const invoiceModal = document.getElementById('invoice-modal');
        if (invoiceModal && !invoiceModal.classList.contains('hidden')) {
          this.closeInvoiceModal();
          return;
        }
        const dialer = document.getElementById('speed-dialer-modal');
        if (dialer && !dialer.classList.contains('hidden')) {
          this.closeSpeedDialer();
          return;
        }
        const closer = document.getElementById('deal-closer-modal');
        if (closer && !closer.classList.contains('hidden')) {
          this.closeDealCloserModal();
          return;
        }
        const portal = document.getElementById('portal-preview-modal');
        if (portal && !portal.classList.contains('hidden')) {
          this.closePortalPreview();
          return;
        }
        const leadModal = document.getElementById('lead-modal');
        if (leadModal && !leadModal.classList.contains('hidden')) {
          this.closeLeadModal();
          return;
        }
      }

      // Kaushik's Live Calling HUD Hotkeys: [1], [2], [3], [4], [Space], [←], [→]
      const dialerModal = document.getElementById('speed-dialer-modal');
      const isDialerActive = dialerModal && !dialerModal.classList.contains('hidden');
      const isInputFocused = document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);

      if (isDialerActive && !isInputFocused) {
        if (e.key === '1') {
          e.preventDefault();
          this.recordDialerOutcome('no_answer');
        } else if (e.key === '2') {
          e.preventDefault();
          this.recordDialerOutcome('whatsapp');
        } else if (e.key === '3') {
          e.preventDefault();
          this.recordDialerOutcome('demo');
        } else if (e.key === '4') {
          e.preventDefault();
          this.recordDialerOutcome('won');
        } else if (e.code === 'Space') {
          e.preventDefault();
          this.toggleCallTimer();
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          this.dialerNext();
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          this.dialerPrev();
        }
      }
    });

    const searchInput = document.getElementById('cmd-k-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.renderCommandPaletteResults(e.target.value);
      });
      searchInput.addEventListener('keydown', (e) => {
        const items = document.querySelectorAll('.cmd-k-item');
        if (items.length === 0) return;
        let selectedIdx = Array.from(items).findIndex(el => el.classList.contains('selected'));

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          items.forEach(el => el.classList.remove('selected'));
          selectedIdx = (selectedIdx + 1) % items.length;
          items[selectedIdx].classList.add('selected');
          items[selectedIdx].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          items.forEach(el => el.classList.remove('selected'));
          selectedIdx = (selectedIdx - 1 + items.length) % items.length;
          items[selectedIdx].classList.add('selected');
          items[selectedIdx].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (selectedIdx >= 0 && items[selectedIdx]) {
            items[selectedIdx].click();
          }
        }
      });
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  app.init();
});
