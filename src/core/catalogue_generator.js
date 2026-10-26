// src/core/catalogue_generator.js - Minimal Mobile-First B2B Catalogue Generator
const fs = require('node:fs');
const path = require('node:path');

/**
 * Builds safe WhatsApp click-to-chat URL using encodeURIComponent
 * Supports English, Hindi, Gujarati, apostrophes, and currency symbols (₹)
 */
function buildWhatsAppLink({ whatsapp_number, business_name, product_name, moq, language = 'EN' }) {
  const cleanPhone = (whatsapp_number || '').replace(/\D/g, '') || '91XXXXXXXXXX';
  const name = business_name || 'Business';
  const prod = product_name || 'Product';
  const moqPart = moq ? ` (MOQ: ${moq})` : '';

  let message = '';
  const langUpper = (language || 'EN').toUpperCase();

  if (langUpper === 'HI') {
    // Hindi template (marked: needs native-speaker review)
    message = `नमस्ते ${name}, मैंने आपकी कैटलॉग देखी और मुझे ${prod}${moqPart} में रुचि है। कृपया वर्तमान थोक दर साझा करें।`;
  } else if (langUpper === 'GU') {
    // Gujarati template (marked: needs native-speaker review)
    message = `નમસ્તે ${name}, મેં તમારી કેટલોગ જોઈ અને મને ${prod}${moqPart} માં રસ છે. કૃપા કરીને વર્તમાન ભાવ જણાવશો.`;
  } else {
    // English default
    message = `Namaste ${name}, I saw your catalogue and I am interested in ${prod}${moqPart}. Please share current wholesale rate and catalog.`;
  }

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

/**
 * Generates Schema.org LocalBusiness JSON-LD from client-supplied fields only.
 * No fabricated SEO or ranking claims.
 */
function generateLocalBusinessJsonLd(catalogue) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    'name': catalogue.business_name,
    'description': catalogue.tagline || catalogue.business_name
  };

  if (catalogue.phone) schema.telephone = catalogue.phone;
  if (catalogue.email) schema.email = catalogue.email;
  if (catalogue.address) {
    schema.address = {
      '@type': 'PostalAddress',
      'streetAddress': catalogue.address,
      'addressCountry': 'IN'
    };
  }
  if (catalogue.google_maps_url) {
    schema.hasMap = catalogue.google_maps_url;
  }

  return JSON.stringify(schema, null, 2);
}

/**
 * Generates clean, neutral SVG placeholder for products without an image
 */
function getNeutralSvgPlaceholder(productName) {
  const cleanName = (productName || 'Product')
    .replace(/[&<>"']/g, '')
    .slice(0, 24);

  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300" fill="%23f1f5f9"><rect width="400" height="300" fill="%23f8fafc"/><rect x="40" y="30" width="320" height="240" rx="8" fill="%23e2e8f0" stroke="%23cbd5e1" stroke-width="2" stroke-dasharray="6,6"/><circle cx="200" cy="130" r="32" fill="%2394a3b8"/><path d="M140 210 L180 160 L210 190 L240 150 L280 210 Z" fill="%23cbd5e1"/><text x="200" y="248" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" font-size="13" font-weight="600" fill="%2364748b" text-anchor="middle">${cleanName}</text></svg>`;
}

/**
 * Generates CSS stylesheet for mobile-first catalogue (tap-friendly, zero deps)
 */
function getCatalogueCss() {
  return `/* Mobile-First Minimal B2B Catalogue Styles */
:root {
  --primary: #059669;
  --primary-hover: #047857;
  --wa-green: #25d366;
  --wa-dark: #128c7e;
  --text-main: #0f172a;
  --text-muted: #64748b;
  --bg-page: #f8fafc;
  --bg-card: #ffffff;
  --border: #e2e8f0;
  --radius: 10px;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: var(--text-main);
  background-color: var(--bg-page);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

.catalogue-container {
  max-width: 540px;
  margin: 0 auto;
  background-color: var(--bg-card);
  min-height: 100vh;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
}

/* Sample banner */
.sample-banner {
  background: #fef08a;
  color: #854d0e;
  font-size: 0.75rem;
  font-weight: 700;
  text-align: center;
  padding: 0.45rem 0.75rem;
  border-bottom: 1px solid #fde047;
}

/* Header & Hero */
.catalogue-header {
  padding: 1.25rem 1rem 1rem;
  border-bottom: 1px solid var(--border);
  text-align: left;
}

.business-title {
  font-size: 1.35rem;
  font-weight: 800;
  color: var(--text-main);
  line-height: 1.25;
  margin-bottom: 0.25rem;
}

.business-tagline {
  font-size: 0.875rem;
  color: var(--text-muted);
  margin-bottom: 0.75rem;
}

.badges-row {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
  margin-bottom: 0.75rem;
}

.badge-chip {
  background: #ecfdf5;
  color: #065f46;
  border: 1px solid #a7f3d0;
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
}

.quick-contact-bar {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.btn-contact {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  min-height: 44px;
  font-size: 0.85rem;
  font-weight: 600;
  text-decoration: none;
  border-radius: 6px;
  transition: opacity 0.15s ease;
}

.btn-call {
  background: #f1f5f9;
  color: var(--text-main);
  border: 1px solid var(--border);
}

.btn-wa-header {
  background: var(--wa-green);
  color: #ffffff;
}

/* Products Section */
.products-section {
  padding: 1.25rem 1rem;
}

.section-heading {
  font-size: 1rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-bottom: 1rem;
}

.product-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  margin-bottom: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.product-img-wrap {
  width: 100%;
  height: 200px;
  background: #f1f5f9;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.product-img-wrap img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.product-body {
  padding: 0.85rem 1rem 1rem;
}

.product-name {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 0.35rem;
}

.product-specs {
  font-size: 0.825rem;
  color: var(--text-muted);
  margin-bottom: 0.5rem;
  line-height: 1.4;
}

.product-meta-row {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.85rem;
  flex-wrap: wrap;
}

.meta-pill {
  font-size: 0.725rem;
  background: #f8fafc;
  color: #475569;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  padding: 0.15rem 0.4rem;
  font-weight: 600;
}

.btn-enquire-wa {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  width: 100%;
  min-height: 46px;
  background: var(--wa-green);
  color: #ffffff;
  font-size: 0.9rem;
  font-weight: 700;
  text-decoration: none;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(37, 211, 102, 0.2);
}

.btn-enquire-wa:hover {
  background: var(--wa-dark);
}

/* Company / Location Section */
.company-section {
  padding: 1.25rem 1rem;
  background: #f8fafc;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}

.company-title {
  font-size: 0.95rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.company-address {
  font-size: 0.825rem;
  color: #475569;
  margin-bottom: 0.75rem;
  line-height: 1.45;
}

.btn-maps {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 40px;
  padding: 0 0.85rem;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  color: #1e40af;
  font-size: 0.825rem;
  font-weight: 600;
  border-radius: 6px;
  text-decoration: none;
}

/* Footer */
.catalogue-footer {
  padding: 1.5rem 1rem 2rem;
  text-align: center;
  font-size: 0.75rem;
  color: #94a3b8;
}

.disclaimer-note {
  font-size: 0.7rem;
  color: #94a3b8;
  margin-top: 0.5rem;
}
`;
}

/**
 * Generates standalone static HTML string embedding catalogue data
 * Works offline from file:// without requiring network fetch.
 */
function generateCatalogueHtml(catalogue) {
  const isSample = Boolean(catalogue.is_sample);
  const jsonLd = generateLocalBusinessJsonLd(catalogue);
  const lang = (catalogue.language || 'EN').toUpperCase();
  const badges = Array.isArray(catalogue.verified_badges)
    ? catalogue.verified_badges
    : (typeof catalogue.verified_badges === 'string' ? JSON.parse(catalogue.verified_badges || '[]') : []);

  const rawProducts = Array.isArray(catalogue.products)
    ? catalogue.products
    : (typeof catalogue.products === 'string' ? JSON.parse(catalogue.products || '[]') : []);

  // Prepare products with safe WhatsApp links
  const products = rawProducts.map((p, idx) => {
    const waLink = buildWhatsAppLink({
      whatsapp_number: catalogue.whatsapp_number,
      business_name: catalogue.business_name,
      product_name: p.name,
      moq: p.moq,
      language: lang
    });
    return {
      ...p,
      id: p.id || `prod_${idx + 1}`,
      wa_link: waLink,
      display_image: p.image_url || getNeutralSvgPlaceholder(p.name),
      alt_text: (p.alt || `${p.name} - ${catalogue.business_name}`).replace(/"/g, '&quot;')
    };
  });

  const embeddedData = {
    business_name: catalogue.business_name,
    tagline: catalogue.tagline || '',
    language: lang,
    whatsapp_number: catalogue.whatsapp_number,
    phone: catalogue.phone || '',
    email: catalogue.email || '',
    address: catalogue.address || '',
    google_maps_url: catalogue.google_maps_url || '',
    verified_badges: badges,
    is_sample: isSample,
    products
  };

  const cleanPhone = (catalogue.whatsapp_number || '').replace(/\D/g, '') || '91XXXXXXXXXX';
  const generalWaLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(`Namaste ${catalogue.business_name}, I saw your B2B catalogue and would like to enquire about your products.`)}`;

  return `<!DOCTYPE html>
<html lang="${lang.toLowerCase()}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(catalogue.business_name)} — Official B2B Catalogue</title>
  <meta name="description" content="${escapeHtml(catalogue.tagline || catalogue.business_name + ' B2B product catalogue')}">

  <!-- Open Graph Meta Tags for WhatsApp & Social Sharing -->
  <meta property="og:title" content="${escapeHtml(catalogue.business_name)} — Official B2B Catalogue">
  <meta property="og:description" content="${escapeHtml(catalogue.meta_description || catalogue.tagline || 'Direct factory product specifications and WhatsApp enquiries')}">
  <meta property="og:type" content="website">
  <meta property="og:image" content="${products[0]?.image_url || ''}">

  <!-- Twitter Card Meta -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(catalogue.business_name)}">
  <meta name="twitter:description" content="${escapeHtml(catalogue.meta_description || catalogue.tagline || 'Official catalogue')}">
  <meta name="twitter:image" content="${products[0]?.image_url || ''}">

  <!-- LocalBusiness Schema JSON-LD (Client-provided data only) -->
  <script type="application/ld+json">
${jsonLd}
  </script>

  <!-- External or Offline CSS -->
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="catalogue-container">
    ${isSample ? `
      <div class="sample-banner">
        ⚠️ Sample Catalogue • For Demonstration Only (Not Official Client Proof)
      </div>
    ` : ''}

    <header class="catalogue-header">
      <h1 class="business-title">${escapeHtml(catalogue.business_name)}</h1>
      ${catalogue.tagline ? `<p class="business-tagline">${escapeHtml(catalogue.tagline)}</p>` : ''}

      ${badges.length > 0 ? `
        <div class="badges-row">
          ${badges.map(b => `<span class="badge-chip">✓ ${escapeHtml(b)}</span>`).join('')}
        </div>
      ` : ''}

      <div class="quick-contact-bar">
        ${catalogue.phone ? `
          <a href="tel:${escapeHtml(catalogue.phone)}" class="btn-contact btn-call">
            📞 Call Factory
          </a>
        ` : ''}
        <a href="${generalWaLink}" target="_blank" rel="noopener" class="btn-contact btn-wa-header">
          💬 WhatsApp
        </a>
      </div>
    </header>

    <main class="products-section">
      <div class="section-heading">📦 Product Showcase (${products.length})</div>

      <div class="products-list">
        ${products.map(p => `
          <article class="product-card" id="${escapeHtml(p.id)}">
            <div class="product-img-wrap">
              <img src="${p.display_image}" alt="${p.alt_text}" loading="lazy">
            </div>
            <div class="product-body">
              <h2 class="product-name">${escapeHtml(p.name)}</h2>
              ${p.specs ? `<p class="product-specs">${escapeHtml(p.specs)}</p>` : ''}

              <div class="product-meta-row">
                ${p.moq ? `<span class="meta-pill">MOQ: ${escapeHtml(p.moq)}</span>` : ''}
                ${p.lead_time ? `<span class="meta-pill">Dispatch: ${escapeHtml(p.lead_time)}</span>` : ''}
              </div>

              <a href="${p.wa_link}" target="_blank" rel="noopener" class="btn-enquire-wa">
                <span>💬 Enquire on WhatsApp</span>
              </a>
            </div>
          </article>
        `).join('')}
      </div>
    </main>

    ${(catalogue.address || catalogue.google_maps_url) ? `
      <section class="company-section">
        <h3 class="company-title">📍 Manufacturing Unit & Office</h3>
        ${catalogue.address ? `<p class="company-address">${escapeHtml(catalogue.address)}</p>` : ''}
        ${catalogue.google_maps_url ? `
          <a href="${escapeHtml(catalogue.google_maps_url)}" target="_blank" rel="noopener" class="btn-maps">
            🗺️ View on Google Maps
          </a>
        ` : ''}
      </section>
    ` : ''}

    <footer class="catalogue-footer">
      <p>© ${new Date().getFullYear()} ${escapeHtml(catalogue.business_name)}. All rights reserved.</p>
      ${lang !== 'EN' ? `<p class="disclaimer-note">Language: ${lang} (needs native-speaker review)</p>` : ''}
      <p class="disclaimer-note">Verified B2B Direct Catalogue</p>
    </footer>
  </div>

  <!-- Embedded & External Catalogue Data for Offline & file:// Compatibility -->
  <script src="catalogue-data.js"></script>
  <script>
    window.CATALOGUE_DATA = window.CATALOGUE_DATA || ${JSON.stringify(embeddedData, null, 2)};
  </script>
</body>
</html>`;
}

/**
 * Generates delivery handover checklist markdown file
 */
function generateHandoverChecklist(catalogue) {
  return `# B2B Mobile Catalogue Client Handover Checklist
Generated for: ${catalogue.business_name}
Token ID: ${catalogue.token}
Date: ${new Date().toISOString().split('T')[0]}

> **Notice:** Fill out each field below during final client onboarding. No pricing or claims should be assumed.

---

### 1. Hosting & Domain Ownership
- [ ] **Hosting Account Owner:** [ Client Name / Email ]
- [ ] **Domain Name:** [ e.g. clientname.in ]
- [ ] **Domain Registrar:** [ Registrar Name & Account Email ]
- [ ] **DNS Provider:** [ DNS Provider Name ]
- [ ] **SSL Certificate Status:** [ Active / HTTPS Valid ]
- [ ] **Annual Renewal Responsibility:** [ Client / Agency / Third Party ]
- [ ] **Next Renewal Due Date:** [ YYYY-MM-DD ]

---

### 2. WhatsApp Enquiry Desk Verification
- [ ] **Registered WhatsApp Number:** \`${catalogue.whatsapp_number || '91XXXXXXXXXX'}\`
- [ ] Verified WhatsApp click-to-chat opens correct owner chat on mobile
- [ ] Verified prefilled product name and MOQ appear accurately
- [ ] Verified ₹ and apostrophe formatting in inquiry link

---

### 3. Product Catalog & Image Specifications
- [ ] **Image Source:** Client-supplied photos only (zero stock/scraped images)
- [ ] **Size Enforcement:** All photos under 2MB
- [ ] **Alt Text Verified:** Every product has technical alt text for accessibility
- [ ] **Optimization Step:** If uncompressed, convert to WebP or run through TinyPNG (< 200KB per photo)

---

### 4. How to Update Products Offline
1. Open \`catalogue-data.js\` in any plain text editor (Notepad, TextEdit, VS Code).
2. Locate the \`products\` array.
3. Edit existing product names, specifications, or add new items following the template structure.
4. Save the file and upload \`catalogue-data.js\` to your static hosting folder.

---

### 5. Client Support & Maintenance Terms
- **Warranty / Support Period:** [ e.g. 30 Days Free Setup Support ]
- **Support Contact Email:** [ Support Email ]
- **Emergency Contact:** [ Support Phone ]
`;
}

/**
 * Exports complete standalone catalogue package to disk
 */
function exportCatalogueToDisk(catalogue, targetDir) {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const htmlContent = generateCatalogueHtml(catalogue);
  const cssContent = getCatalogueCss();
  const jsDataContent = `// Static Offline Data File for ${catalogue.business_name}\nwindow.CATALOGUE_DATA = ${JSON.stringify(catalogue, null, 2)};\n`;
  const checklistContent = generateHandoverChecklist(catalogue);

  fs.writeFileSync(path.join(targetDir, 'index.html'), htmlContent, 'utf8');
  fs.writeFileSync(path.join(targetDir, 'style.css'), cssContent, 'utf8');
  fs.writeFileSync(path.join(targetDir, 'catalogue-data.js'), jsDataContent, 'utf8');
  fs.writeFileSync(path.join(targetDir, 'HANDOVER_CHECKLIST.md'), checklistContent, 'utf8');

  return {
    exportDir: targetDir,
    files: ['index.html', 'style.css', 'catalogue-data.js', 'HANDOVER_CHECKLIST.md']
  };
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = {
  buildWhatsAppLink,
  generateLocalBusinessJsonLd,
  generateCatalogueHtml,
  generateHandoverChecklist,
  exportCatalogueToDisk,
  getCatalogueCss,
  getNeutralSvgPlaceholder
};
