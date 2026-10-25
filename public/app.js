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
  currentLeadDetail: null,

  init() {
    this.bindEvents();
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
  },

  switchView(viewName) {
    this.activeView = viewName;
    document.querySelectorAll('.nav-item').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-view') === viewName);
    });

    document.querySelectorAll('.content-view').forEach(v => {
      v.classList.toggle('active', v.id === `view-${viewName}`);
    });

    const titles = {
      dashboard: ['Executive Dashboard', 'Real-time MSME discovery, digital deficiency analysis, and pipeline performance'],
      cmo: ['AI CMO Command Center', 'Strategic revenue targets, factory software clusters, and conversion velocity playbook'],
      mantisai: ['Mantis AI Lead Finder', 'Map-first live discovery, local listing audits, and buying signals for Indian factories'],
      explorer: ['Lead Explorer', 'Filter and prioritize verified Indian enterprises by need, score, and commercial fit'],
      crm: ['Sales CRM & Pipeline', 'Consultative B2B stages from qualification to closed digital growth packages'],
      campaigns: ['Campaign Manager & Queue', 'Personalized English and Hindi outreach approval pipeline'],
      operations: ['Research Operations', 'Manage legal discovery connectors, batch ingestions, and background jobs'],
      reports: ['Reports & Unit Economics', 'Lead quality by source, conversion rates, and revenue models'],
      settings: ['Settings & Governance', 'Dynamic 100-point scoring weights and suppression registry']
    };

    const [title, sub] = titles[viewName] || ['BharatGrowth AI', ''];
    document.getElementById('page-title').textContent = title;
    document.getElementById('page-subtitle').textContent = sub;

    // View-specific loaders
    if (viewName === 'dashboard') this.loadDashboard();
    else if (viewName === 'cmo') this.loadCmoConsole();
    else if (viewName === 'mantisai') this.loadMantisAiFinder();
    else if (viewName === 'explorer') this.loadExplorerLeads();
    else if (viewName === 'crm') this.loadCrmKanban();
    else if (viewName === 'campaigns') this.loadCampaigns();
    else if (viewName === 'operations') this.loadOperations();
    else if (viewName === 'reports') this.loadReports();
    else if (viewName === 'settings') this.loadSettings();
  },

  async loadDashboard() {
    try {
      const res = await fetch('/api/dashboard');
      const data = await res.json();

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
      const res = await fetch('/api/leads?limit=100');
      const data = await res.json();
      const allLeads = data.leads || [];

      // Update KPI counters
      const totalEl = document.getElementById('crm-stat-total');
      if (totalEl) totalEl.textContent = allLeads.length;
      const tabAll = document.getElementById('tab-count-all');
      if (tabAll) tabAll.textContent = allLeads.length;

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

  // Reports
  async loadReports() {
    try {
      const res = await fetch('/api/reports');
      const data = await res.json();

      // Service Revenue table
      const revTbody = document.getElementById('service-revenue-tbody');
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

      // Source Quality table
      const sqTbody = document.getElementById('source-quality-tbody');
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

      // Region metrics table
      const regTbody = document.getElementById('region-metrics-tbody');
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
  }
};

document.addEventListener('DOMContentLoaded', () => {
  app.init();
});
