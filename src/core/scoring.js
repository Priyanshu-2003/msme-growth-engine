// src/core/scoring.js - Transparent 100-Point Lead Scoring & Prioritization Model
const { MAJOR_INDUSTRIAL_CLUSTERS } = require('./taxonomy.js');

/**
 * Evaluates a lead record and calculates a transparent 100-point score
 * based on dynamic weights from the settings table.
 */
function calculateLeadScore(lead, settings = {}) {
  // Configurable weights (defaults sum to 100)
  const wDigital = settings.weight_digital_need ?? 30;
  const wCommercial = settings.weight_commercial_fit ?? 25;
  const wContact = settings.weight_contactability ?? 20;
  const wEvidence = settings.weight_evidence_freshness ?? 15;
  const wGeo = settings.weight_geo_fit ?? 10;

  const breakdown = {
    digitalNeed: { score: 0, max: wDigital, details: [] },
    commercialFit: { score: 0, max: wCommercial, details: [] },
    contactability: { score: 0, max: wContact, details: [] },
    evidenceFreshness: { score: 0, max: wEvidence, details: [] },
    geoFit: { score: 0, max: wGeo, details: [] },
    penalties: [],
    total: 0,
    queue: 'LOW'
  };

  // 1. Digital Need (Weight: wDigital, e.g. 30 pts)
  // Evaluates actual observable gaps: no website, outdated website, broken SSL, no mobile optimization, missing social
  const webStatus = lead.website_status;
  const da = lead.digital_assessment || {};

  if (webStatus === 'NO_WEBSITE_FOUND') {
    // High digital need, but scaled to avoid over-awarding if unverified
    breakdown.digitalNeed.score += Math.round(wDigital * 0.70);
    breakdown.digitalNeed.details.push('No discoverable official domain found (+70% of digital need weight)');
  } else if (webStatus === 'WEBSITE_OUTDATED' || webStatus === 'WEBSITE_UNAVAILABLE') {
    breakdown.digitalNeed.score += Math.round(wDigital * 0.85);
    breakdown.digitalNeed.details.push('Website exists but is outdated, non-responsive, or technically degraded (+85% of weight)');
  } else if (webStatus === 'WEBSITE_CONFIRMED') {
    // Check secondary digital needs (SEO, Social, Catalogue)
    let subPts = 0;
    if (da.hasSsl === false) {
      subPts += Math.round(wDigital * 0.25);
      breakdown.digitalNeed.details.push('Missing or invalid SSL security (+25%)');
    }
    if (da.mobileFriendly === false) {
      subPts += Math.round(wDigital * 0.35);
      breakdown.digitalNeed.details.push('Lacks mobile responsiveness viewport (+35%)');
    }
    if (!da.socialProfiles || da.socialProfiles.length === 0) {
      subPts += Math.round(wDigital * 0.20);
      breakdown.digitalNeed.details.push('No linked active social media profiles (+20%)');
    }
    breakdown.digitalNeed.score += Math.min(subPts, wDigital);
    if (subPts === 0) {
      breakdown.digitalNeed.details.push('Website is modern and secure; lower primary website need');
    }
  } else {
    breakdown.digitalNeed.details.push('Website status uncertain or insufficient evidence (+0)');
  }

  // 2. Commercial Fit (Weight: wCommercial, e.g. 25 pts)
  // High value: Manufacturers, Exporters, Auto Parts, Engineering, Food/Textile clusters with commercial capacity
  const cat = lead.industry_category;
  const entityType = (lead.entity_type || '').toUpperCase();
  const msmeTier = (lead.msme_tier || '').toUpperCase();

  let commPct = 0;
  if (['A', 'C', 'D', 'F', 'I'].includes(cat)) {
    // High B2B value sectors (Manufacturing, Food Processing, Textiles, Auto Parts, Exporters)
    commPct += 0.50;
    breakdown.commercialFit.details.push('High-value B2B industry category (+50% commercial fit)');
  } else if (['B', 'E', 'G', 'H', 'J', 'K'].includes(cat)) {
    commPct += 0.35;
    breakdown.commercialFit.details.push('Medium-value industrial / commercial category (+35% commercial fit)');
  } else {
    commPct += 0.20;
    breakdown.commercialFit.details.push('Standard commercial / service category (+20% commercial fit)');
  }

  if (entityType === 'MANUFACTURER' || entityType === 'EXPORTER') {
    commPct += 0.30;
    breakdown.commercialFit.details.push('Entity classified as Manufacturer / Exporter (+30%)');
  } else if (entityType === 'WHOLESALER' || entityType === 'DISTRIBUTOR') {
    commPct += 0.20;
    breakdown.commercialFit.details.push('Entity classified as Wholesaler / Distributor (+20%)');
  }

  if (msmeTier === 'SMALL' || msmeTier === 'MEDIUM') {
    commPct += 0.20;
    breakdown.commercialFit.details.push('Small/Medium enterprise investment tier with established budget (+20%)');
  } else if (msmeTier === 'MICRO') {
    commPct += 0.10;
    breakdown.commercialFit.details.push('Micro enterprise tier (+10%)');
  }

  breakdown.commercialFit.score = Math.min(Math.round(wCommercial * commPct), wCommercial);

  // 3. Contactability (Weight: wContact, e.g. 20 pts)
  // Direct phone and/or official email
  let contactPct = 0;
  if (lead.phone && lead.normalized_phone) {
    contactPct += 0.60;
    breakdown.contactability.details.push('Valid 10-digit Indian business phone (+60% contactability)');
  }
  if (lead.email && lead.email.includes('@')) {
    contactPct += 0.30;
    breakdown.contactability.details.push('Business email available (+30% contactability)');
  }
  if (lead.address && lead.address.length > 10) {
    contactPct += 0.10;
    breakdown.contactability.details.push('Detailed physical business address available (+10%)');
  }
  if (contactPct === 0) {
    breakdown.contactability.details.push('No direct phone or email available (+0)');
  }
  breakdown.contactability.score = Math.min(Math.round(wContact * contactPct), wContact);

  // 4. Evidence Quality & Freshness (Weight: wEvidence, e.g. 15 pts)
  let evidencePct = 0;
  const evidenceList = lead.evidence || [];
  if (evidenceList.length >= 2) {
    evidencePct += 0.50;
    breakdown.evidenceFreshness.details.push('Multi-point verified evidence available (+50%)');
  } else if (evidenceList.length === 1) {
    evidencePct += 0.25;
    breakdown.evidenceFreshness.details.push('Single source evidence record (+25%)');
  }

  if (lead.last_verification_date) {
    const daysOld = (Date.now() - new Date(lead.last_verification_date).getTime()) / (1000 * 60 * 60 * 24);
    if (daysOld <= 30) {
      evidencePct += 0.50;
      breakdown.evidenceFreshness.details.push('Recently verified within 30 days (+50%)');
    } else if (daysOld <= 90) {
      evidencePct += 0.25;
      breakdown.evidenceFreshness.details.push('Verified within 90 days (+25%)');
    }
  } else {
    breakdown.evidenceFreshness.details.push('Pending recent technical verification');
  }
  breakdown.evidenceFreshness.score = Math.min(Math.round(wEvidence * evidencePct), wEvidence);

  // 5. Geographic & Industry Fit (Weight: wGeo, e.g. 10 pts)
  let geoPct = 0;
  const isCluster = MAJOR_INDUSTRIAL_CLUSTERS.some(
    c => c.city.toLowerCase() === (lead.city || '').toLowerCase() ||
         (lead.district && c.city.toLowerCase() === lead.district.toLowerCase())
  );
  if (isCluster) {
    geoPct += 0.70;
    breakdown.geoFit.details.push(`${lead.city} is a recognized Indian industrial hub/cluster (+70%)`);
  } else {
    geoPct += 0.30;
    breakdown.geoFit.details.push('General tier-2/3 Indian location (+30%)');
  }
  if (lead.pincode && /^[1-9][0-9]{5}$/.test(lead.pincode)) {
    geoPct += 0.30;
    breakdown.geoFit.details.push('Valid 6-digit postal PIN code (+30%)');
  }
  breakdown.geoFit.score = Math.min(Math.round(wGeo * geoPct), wGeo);

  // Penalties and exclusions
  let penaltyPts = 0;
  if (!lead.normalized_phone && !lead.email) {
    penaltyPts += 15;
    breakdown.penalties.push('Severe contactability penalty: No phone or email (-15 pts)');
  }
  if (lead.verification_status === 'VERIFIED_INACTIVE' || lead.verification_status === 'FLAGGED') {
    penaltyPts += 40;
    breakdown.penalties.push('Business closed or flagged invalid (-40 pts)');
  }

  let rawTotal = breakdown.digitalNeed.score +
                 breakdown.commercialFit.score +
                 breakdown.contactability.score +
                 breakdown.evidenceFreshness.score +
                 breakdown.geoFit.score -
                 penaltyPts;

  const total = Math.max(0, Math.min(100, rawTotal));
  breakdown.total = total;

  // Operational Queues
  if (total >= 70) {
    breakdown.queue = 'HIGH';
  } else if (total >= 45) {
    breakdown.queue = 'MEDIUM';
  } else {
    breakdown.queue = 'LOW';
  }

  return breakdown;
}

module.exports = {
  calculateLeadScore
};
