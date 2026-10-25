// src/sources/csv_adapter.js - Resilient CSV/TSV parser with intelligent Indian column auto-mapping
const fs = require('node:fs');
const readline = require('node:readline');
const {
  normalizeIndianPhone,
  normalizePincode,
  normalizeBusinessName,
  categorizeIndustry,
  INDIAN_STATES_AND_UTS
} = require('../core/taxonomy.js');

/**
 * Intelligent header mapper matching various Indian B2B data column conventions
 */
function mapHeaders(headers) {
  const map = {
    name: -1,
    phone: -1,
    email: -1,
    city: -1,
    state: -1,
    district: -1,
    pincode: -1,
    website: -1,
    category: -1,
    address: -1,
    entityType: -1,
    msmeTier: -1
  };

  headers.forEach((h, idx) => {
    const clean = h.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (map.name === -1 && /^(businessname|companyname|name|firmname|enterprisename|company|firm|title)$/.test(clean)) map.name = idx;
    else if (map.phone === -1 && /^(phone|mobile|contact|tel|phonenumber|contactno|mobileno|cell)$/.test(clean)) map.phone = idx;
    else if (map.email === -1 && /^(email|mail|emailid|emailaddress)$/.test(clean)) map.email = idx;
    else if (map.city === -1 && /^(city|town|village|place|location)$/.test(clean)) map.city = idx;
    else if (map.state === -1 && /^(state|province|region|ut)$/.test(clean)) map.state = idx;
    else if (map.district === -1 && /^(district|dist)$/.test(clean)) map.district = idx;
    else if (map.pincode === -1 && /^(pincode|pin|postalcode|zip|zipcode)$/.test(clean)) map.pincode = idx;
    else if (map.website === -1 && /^(website|url|web|domain|site)$/.test(clean)) map.website = idx;
    else if (map.category === -1 && /^(category|industry|sector|businesscategory|product|products|services|natureofbusiness)$/.test(clean)) map.category = idx;
    else if (map.address === -1 && /^(address|fulladdress|street|locationaddress)$/.test(clean)) map.address = idx;
    else if (map.entityType === -1 && /^(entitytype|type|businesstype|role)$/.test(clean)) map.entityType = idx;
    else if (map.msmeTier === -1 && /^(msmetier|tier|size|scale)$/.test(clean)) map.msmeTier = idx;
  });

  return map;
}

/**
 * Parses raw CSV text into array of rows respecting quotes
 */
function parseCsvLine(line, delimiter = ',') {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Parses a CSV file or string into normalized lead candidates
 */
async function parseCsvContent(content, sourceName = 'User CSV Upload') {
  const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return { success: false, error: 'Empty CSV file', leads: [] };

  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  const rawHeaders = parseCsvLine(lines[0], delimiter);
  const headerMap = mapHeaders(rawHeaders);

  if (headerMap.name === -1) {
    return {
      success: false,
      error: `Could not identify a Business/Company Name column. Found headers: [${rawHeaders.join(', ')}]`,
      leads: []
    };
  }

  const parsedLeads = [];
  const errors = [];

  for (let lineIdx = 1; lineIdx < lines.length; lineIdx++) {
    const row = parseCsvLine(lines[lineIdx], delimiter);
    if (row.length === 0 || row.every(val => !val)) continue;

    const rawName = row[headerMap.name] || '';
    if (!rawName.trim()) {
      errors.push(`Line ${lineIdx + 1}: Skipped row due to missing business name.`);
      continue;
    }

    const rawPhone = headerMap.phone !== -1 ? row[headerMap.phone] : null;
    const rawEmail = headerMap.email !== -1 ? row[headerMap.email] : null;
    const rawCity = headerMap.city !== -1 ? row[headerMap.city] : 'Unknown';
    const rawState = headerMap.state !== -1 ? row[headerMap.state] : '';
    const rawDistrict = headerMap.district !== -1 ? row[headerMap.district] : null;
    const rawPincode = headerMap.pincode !== -1 ? row[headerMap.pincode] : null;
    const rawWebsite = headerMap.website !== -1 ? row[headerMap.website] : null;
    const rawCategory = headerMap.category !== -1 ? row[headerMap.category] : '';
    const rawAddress = headerMap.address !== -1 ? row[headerMap.address] : '';
    const rawEntityType = headerMap.entityType !== -1 ? row[headerMap.entityType] : 'UNKNOWN';
    const rawTier = headerMap.msmeTier !== -1 ? row[headerMap.msmeTier] : 'UNKNOWN';

    // Normalize state to standard 28 States / 8 UTs if matching
    let matchedState = rawState;
    if (rawState) {
      const match = INDIAN_STATES_AND_UTS.find(s => s.toLowerCase() === rawState.trim().toLowerCase());
      if (match) matchedState = match;
    }
    if (!matchedState) matchedState = 'India';

    const { category, subcategory } = categorizeIndustry(rawCategory || rawName);

    parsedLeads.push({
      business_name: rawName.trim(),
      industry_category: category,
      subcategory: subcategory,
      entity_type: rawEntityType.toUpperCase(),
      msme_tier: rawTier.toUpperCase(),
      state: matchedState,
      district: rawDistrict ? rawDistrict.trim() : null,
      city: rawCity.trim(),
      pincode: normalizePincode(rawPincode),
      address: rawAddress ? rawAddress.trim() : null,
      phone: rawPhone ? rawPhone.trim() : null,
      email: rawEmail ? rawEmail.trim() : null,
      website: rawWebsite ? rawWebsite.trim() : null,
      source_name: sourceName,
      source_record_id: `csv_row_${lineIdx + 1}`,
      raw_category_input: rawCategory
    });
  }

  return {
    success: true,
    totalLines: lines.length - 1,
    importedCount: parsedLeads.length,
    errors,
    leads: parsedLeads
  };
}

module.exports = {
  mapHeaders,
  parseCsvLine,
  parseCsvContent
};
