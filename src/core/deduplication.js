// src/core/deduplication.js - Multi-signal deduplication & suppression matching for Indian MSMEs
const { normalizeBusinessName, normalizeIndianPhone, normalizeDomain } = require('./taxonomy.js');

/**
 * Computes Jaccard Similarity between two strings based on token sets
 */
function tokenJaccardSimilarity(strA, strB) {
  if (!strA || !strB) return 0.0;
  const setA = new Set(strA.split(/\s+/).filter(Boolean));
  const setB = new Set(strB.split(/\s+/).filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0.0;

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

/**
 * Checks if a candidate record matches any existing lead in SQLite DB
 * Returns { isDuplicate: boolean, matchedLead: object | null, matchReason: string | null }
 */
function findDuplicateInDb(db, candidate) {
  const normPhone = normalizeIndianPhone(candidate.phone);
  const normDomain = normalizeDomain(candidate.website);
  const normName = normalizeBusinessName(candidate.business_name);
  const city = (candidate.city || '').trim().toLowerCase();

  // 1. Phone match (Strongest individual signal for Indian MSME business phone)
  if (normPhone) {
    const matchByPhone = db.prepare('SELECT * FROM leads WHERE normalized_phone = ? LIMIT 1').get(normPhone);
    if (matchByPhone) {
      return {
        isDuplicate: true,
        matchedLead: matchByPhone,
        matchReason: `Exact phone match (${normPhone})`
      };
    }
  }

  // 2. Domain match (Strong signal if official domain exists)
  if (normDomain) {
    const matchByDomain = db.prepare('SELECT * FROM leads WHERE normalized_domain = ? LIMIT 1').get(normDomain);
    if (matchByDomain) {
      return {
        isDuplicate: true,
        matchedLead: matchByDomain,
        matchReason: `Exact domain match (${normDomain})`
      };
    }
  }

  // 3. Name + City match
  if (normName && normName.length >= 3 && city) {
    const candidateLeads = db.prepare('SELECT id, business_name, normalized_name, city, state FROM leads WHERE LOWER(city) = ?').all(city);
    for (const lead of candidateLeads) {
      if (lead.normalized_name === normName) {
        return {
          isDuplicate: true,
          matchedLead: lead,
          matchReason: `Exact normalized name match in ${candidate.city}`
        };
      }
      // Token Jaccard similarity for slight spelling differences (e.g., 'Shree Balaji Textiles' vs 'Balaji Textiles')
      const sim = tokenJaccardSimilarity(normName, lead.normalized_name);
      if (sim >= 0.85) {
        return {
          isDuplicate: true,
          matchedLead: lead,
          matchReason: `High name similarity (${Math.round(sim * 100)}%) in ${candidate.city}`
        };
      }
    }
  }

  return { isDuplicate: false, matchedLead: null, matchReason: null };
}

/**
 * Checks if candidate is present in suppression / opt-out list
 */
function checkSuppression(db, candidate) {
  const normPhone = normalizeIndianPhone(candidate.phone);
  const normEmail = (candidate.email || '').trim().toLowerCase();
  const normDomain = normalizeDomain(candidate.website);

  if (normPhone) {
    const row = db.prepare("SELECT * FROM suppression_list WHERE identifier_type = 'PHONE' AND identifier_val = ? LIMIT 1").get(normPhone);
    if (row) return { isSuppressed: true, reason: `Phone ${normPhone} is on the suppression list: ${row.reason}` };
  }

  if (normEmail) {
    const row = db.prepare("SELECT * FROM suppression_list WHERE identifier_type = 'EMAIL' AND identifier_val = ? LIMIT 1").get(normEmail);
    if (row) return { isSuppressed: true, reason: `Email ${normEmail} is on the suppression list: ${row.reason}` };
  }

  if (normDomain) {
    const row = db.prepare("SELECT * FROM suppression_list WHERE identifier_type = 'DOMAIN' AND identifier_val = ? LIMIT 1").get(normDomain);
    if (row) return { isSuppressed: true, reason: `Domain ${normDomain} is on the suppression list: ${row.reason}` };
  }

  return { isSuppressed: false, reason: null };
}

module.exports = {
  tokenJaccardSimilarity,
  findDuplicateInDb,
  checkSuppression
};
