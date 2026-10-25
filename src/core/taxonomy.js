// src/core/taxonomy.js - Indian Geography, MSME Industry Categories, and Normalization Utilities

const INDIAN_STATES_AND_UTS = [
  // 28 States
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  // 8 Union Territories
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry'
];

// Major Indian industrial and commercial MSME clusters mapped to state & key sub-sectors
const MAJOR_INDUSTRIAL_CLUSTERS = [
  { city: 'Surat', state: 'Gujarat', specializations: ['Textiles & Weaving', 'Diamond Processing', 'Embroidery Machines'] },
  { city: 'Ahmedabad', state: 'Gujarat', specializations: ['Dyes & Chemicals', 'Cotton Textiles', 'Pharmaceutical Machinery'] },
  { city: 'Rajkot', state: 'Gujarat', specializations: ['Diesel Engines', 'Casting & Forging', 'Auto Components', 'Machine Tools'] },
  { city: 'Vadodara', state: 'Gujarat', specializations: ['Heavy Engineering', 'Electrical Equipment', 'Plastics'] },
  { city: 'Morbi', state: 'Gujarat', specializations: ['Ceramic Tiles', 'Sanitaryware', 'Wall Clocks'] },
  { city: 'Pune', state: 'Maharashtra', specializations: ['Automotive Assemblies', 'Precision Tooling', 'Food Processing'] },
  { city: 'Nashik', state: 'Maharashtra', specializations: ['Agro Processing', 'Wine & Beverages', 'Electrical Engineering'] },
  { city: 'Aurangabad', state: 'Maharashtra', specializations: ['Auto Parts', 'Pharmaceuticals', 'Brewing'] },
  { city: 'Nagpur', state: 'Maharashtra', specializations: ['Steel Rerolling', 'Textiles', 'Orange Processing'] },
  { city: 'Ludhiana', state: 'Punjab', specializations: ['Hosiery & Knitwear', 'Bicycle Components', 'Fasteners', 'Sewing Machines'] },
  { city: 'Jalandhar', state: 'Punjab', specializations: ['Sports Goods', 'Leather Footwear', 'Hand Tools', 'Pipe Fittings'] },
  { city: 'Amritsar', state: 'Punjab', specializations: ['Woolen Fabrics', 'Food Products', 'Textile Machinery'] },
  { city: 'Panipat', state: 'Haryana', specializations: ['Home Furnishings', 'Recycled Yarn', 'Blankets', 'Carpets'] },
  { city: 'Faridabad', state: 'Haryana', specializations: ['Tractor Parts', 'Industrial Fabrications', 'Packaging Films'] },
  { city: 'Ambala', state: 'Haryana', specializations: ['Scientific Instruments', 'Glassware', 'Kitchen Appliances'] },
  { city: 'Tiruppur', state: 'Tamil Nadu', specializations: ['Cotton Knitwear', 'Garment Export', 'Dyeing & Printing'] },
  { city: 'Coimbatore', state: 'Tamil Nadu', specializations: ['Pumps & Motors', 'Wet Grinders', 'Textile Machinery', 'Foundries'] },
  { city: 'Salem', state: 'Tamil Nadu', specializations: ['Steel Products', 'Sago & Starch', 'Silver Ornaments'] },
  { city: 'Madurai', state: 'Tamil Nadu', specializations: ['Powerloom Textiles', 'Rubber Products', 'Granite Processing'] },
  { city: 'Peenya (Bengaluru)', state: 'Karnataka', specializations: ['Precision Machining', 'Electronics Assembly', 'Hydraulics'] },
  { city: 'Belagavi', state: 'Karnataka', specializations: ['Hydraulic Cranes', 'Foundry Castings', 'Power Weaving'] },
  { city: 'Kanpur', state: 'Uttar Pradesh', specializations: ['Leather Goods & Saddlery', 'Footwear', 'Chemicals', 'Spices'] },
  { city: 'Moradabad', state: 'Uttar Pradesh', specializations: ['Brassware', 'Metal Handicrafts', 'Artware Export'] },
  { city: 'Agra', state: 'Uttar Pradesh', specializations: ['Leather Footwear', 'Marble Inlay', 'Petha & Sweets'] },
  { city: 'Varanasi', state: 'Uttar Pradesh', specializations: ['Silk Sarees', 'Brocades', 'Diesel Locomotives Ancillary'] },
  { city: 'Jaipur', state: 'Rajasthan', specializations: ['Gemstones & Jewellery', 'Block Printing', 'Handicrafts', 'Marble'] },
  { city: 'Jodhpur', state: 'Rajasthan', specializations: ['Wooden Furniture & Handicrafts', 'Guar Gum', 'Spices'] },
  { city: 'Bhilwara', state: 'Rajasthan', specializations: ['Synthetic Suiting', 'Textile Process Houses'] },
  { city: 'Indore', state: 'Madhya Pradesh', specializations: ['Food Processing', 'Confectionery', 'Pharmaceutical Packaging'] },
  { city: 'Kolkata (Howrah)', state: 'West Bengal', specializations: ['Foundry & Forging', 'Jute Products', 'Hosiery'] },
  { city: 'Kochi (Ernakulam)', state: 'Kerala', specializations: ['Marine Exports', 'Spices Processing', 'Rubber Goods'] },
  { city: 'Hyderabad (Cherlapally)', state: 'Telangana', specializations: ['Plastics & Polymers', 'Bulk Drugs', 'Precision Tools'] }
];

// Configurable MSME Categories A through Q
const MSME_CATEGORIES = {
  'A': {
    code: 'A',
    name: 'Manufacturing and Industrial Suppliers',
    subcategories: ['Industrial Fabrications', 'Sheet Metal Work', 'Fasteners & Bolts', 'Industrial Valves', 'Foundry & Castings', 'Rubber Moulded Goods'],
    servicesPriority: ['Starter websites', 'Product catalogues and B2B catalogues', 'Lead-generation campaigns', 'SEO and local search optimization']
  },
  'B': {
    code: 'B',
    name: 'Agricultural Processing and Agricultural Suppliers',
    subcategories: ['Cold Storage', 'Grain Milling', 'Seed Processing', 'Fertilizer & Organic Inputs', 'Farm Equipment', 'Drip Irrigation'],
    servicesPriority: ['Starter websites', 'Lead-generation campaigns', 'Google Business Profile setup or improvement']
  },
  'C': {
    code: 'C',
    name: 'Food Processing and Packaged Food',
    subcategories: ['Spices & Condiments', 'Bakery & Confectionery', 'Edible Oils', 'Snacks & Namkeen', 'Dairy Products', 'Tea & Coffee Packaging'],
    servicesPriority: ['E-commerce websites', 'Social media management', 'Product catalogues and B2B catalogues', 'Starter websites']
  },
  'D': {
    code: 'D',
    name: 'Textile, Apparel, and Garment Manufacturing',
    subcategories: ['Knitted Garments', 'Woven Fabrics', 'Home Textiles', 'Yarn & Spinning', 'Embroidery & Printing', 'Uniforms & Workwear'],
    servicesPriority: ['Product catalogues and B2B catalogues', 'Starter websites', 'Export-market digital positioning', 'E-commerce websites']
  },
  'E': {
    code: 'E',
    name: 'Furniture, Handicrafts, and Home Products',
    subcategories: ['Wooden Furniture', 'Metal Artware', 'Handicrafts & Decor', 'Modular Kitchens', 'Stone Crafts', 'Carpets & Rugs'],
    servicesPriority: ['E-commerce websites', 'Product catalogues and B2B catalogues', 'Export-market digital positioning', 'Social media management']
  },
  'F': {
    code: 'F',
    name: 'Auto Parts, Machinery, and Engineering',
    subcategories: ['Auto Components', 'Machine Tools', 'Gears & Bearings', 'CNC Machining', 'Pumps & Compressors', 'Hydraulic Systems'],
    servicesPriority: ['Product catalogues and B2B catalogues', 'Starter websites', 'Lead-generation campaigns', 'SEO and local search optimization']
  },
  'G': {
    code: 'G',
    name: 'Packaging, Printing, and Industrial Materials',
    subcategories: ['Corrugated Boxes', 'Flexible Packaging', 'Commercial Printing', 'Labels & Stickers', 'Blow Moulding', 'Paper Bags'],
    servicesPriority: ['Starter websites', 'Lead-generation campaigns', 'Google Business Profile setup or improvement']
  },
  'H': {
    code: 'H',
    name: 'Wholesale and Distribution',
    subcategories: ['Industrial Supplies Wholesale', 'Electrical Wholesale', 'Hardware Wholesale', 'FMCG Distribution', 'Chemicals Trading'],
    servicesPriority: ['Product catalogues and B2B catalogues', 'Starter websites', 'Lead-generation campaigns']
  },
  'I': {
    code: 'I',
    name: 'Exporters and Import-Export Businesses',
    subcategories: ['Agro Commodities Export', 'Engineering Goods Export', 'Handicrafts Export', 'Textile Export', 'Chemicals Export'],
    servicesPriority: ['Export-market digital positioning', 'Starter websites', 'Product catalogues and B2B catalogues', 'SEO and local search optimization']
  },
  'J': {
    code: 'J',
    name: 'Construction, Contractors, and Building Materials',
    subcategories: ['Tiles & Ceramics', 'Sanitaryware', 'Paints & Waterproofing', 'Civil Contractors', 'Aluminium & Glass Works', 'Pipes & Fittings'],
    servicesPriority: ['Google Business Profile setup or improvement', 'Starter websites', 'SEO and local search optimization', 'Lead-generation campaigns']
  },
  'K': {
    code: 'K',
    name: 'Clinics, Healthcare Providers, and Diagnostic Centres',
    subcategories: ['Dental Clinics', 'Diagnostic Pathology Labs', 'Eye Care Clinics', 'Physiotherapy Clinics', 'Ayurvedic Centers', 'Specialty Polyclinics'],
    servicesPriority: ['Google Business Profile setup or improvement', 'SEO and local search optimization', 'Starter websites', 'Social media management']
  },
  'L': {
    code: 'L',
    name: 'Hotels, Restaurants, and Hospitality',
    subcategories: ['Boutique Hotels', 'Restaurants & Cafes', 'Banquet & Party Halls', 'Catering Services', 'Resorts & Homestays'],
    servicesPriority: ['Google Business Profile setup or improvement', 'Social media management', 'SEO and local search optimization', 'Starter websites']
  },
  'M': {
    code: 'M',
    name: 'Retail Shops and Specialty Stores',
    subcategories: ['Jewellery Showrooms', 'Clothing & Boutique', 'Electronics & Appliances', 'Opticians', 'Furniture Showrooms'],
    servicesPriority: ['Google Business Profile setup or improvement', 'Social media management', 'Starter websites', 'E-commerce websites']
  },
  'N': {
    code: 'N',
    name: 'Educational and Training Institutes',
    subcategories: ['Coaching Classes', 'Vocational Training', 'Computer & IT Training', 'Language Institutes', 'Play Schools & Daycares'],
    servicesPriority: ['Lead-generation campaigns', 'Google Business Profile setup or improvement', 'Starter websites', 'Social media management']
  },
  'O': {
    code: 'O',
    name: 'Professional and Local Service Providers',
    subcategories: ['Tax & Accounting Consultants', 'Architecture & Interior Design', 'Legal Advocates', 'Security Agencies', 'Facility Management'],
    servicesPriority: ['Starter websites', 'Google Business Profile setup or improvement', 'SEO and local search optimization']
  },
  'P': {
    code: 'P',
    name: 'Logistics, Transport, and Warehousing',
    subcategories: ['Fleet Operators', 'Cold Chain Transport', 'Warehouses & Godowns', 'Packers & Movers', 'Customs Clearance Agents'],
    servicesPriority: ['Starter websites', 'Google Business Profile setup or improvement', 'Lead-generation campaigns']
  },
  'Q': {
    code: 'Q',
    name: 'Other Relevant MSME Sectors',
    subcategories: ['Solar & Renewable Installations', 'Waste Recycling', 'Custom Job Works', 'Industrial Laundries'],
    servicesPriority: ['Starter websites', 'Lead-generation campaigns', 'Google Business Profile setup or improvement']
  }
};

/**
 * Normalizes Indian Phone Numbers to clean 10-digit format
 * Handles +91, 0 prefix, spaces, dashes, parentheses
 */
function normalizeIndianPhone(phone) {
  if (!phone || typeof phone !== 'string') return null;
  // Strip all non-digit characters
  let clean = phone.replace(/\D/g, '');
  
  // If starts with 91 and has 12 digits, strip 91
  if (clean.length === 12 && clean.startsWith('91')) {
    clean = clean.substring(2);
  }
  // If starts with 0 and has 11 digits, strip 0
  else if (clean.length === 11 && clean.startsWith('0')) {
    clean = clean.substring(1);
  }

  // Valid Indian mobile/landline with STD is typically 10 digits
  if (clean.length === 10) {
    return clean;
  }
  
  return null;
}

/**
 * Normalizes Indian PIN code (6 digits, first digit 1-9)
 */
function normalizePincode(pincode) {
  if (!pincode) return null;
  const str = String(pincode).trim();
  if (/^[1-9][0-9]{5}$/.test(str)) {
    return str;
  }
  return null;
}

/**
 * Normalizes Business Names for fuzzy deduplication
 * Removes legal suffixes (Pvt Ltd, LLP, Industries, Works), punctuation, double spaces
 */
function normalizeBusinessName(name) {
  if (!name || typeof name !== 'string') return '';
  let str = name.toLowerCase();
  
  // Remove common Indian corporate and entity suffixes
  const stopWords = [
    /\bprivate\s+limited\b/g,
    /\bpvt\s*\.?\s*ltd\s*\.?\b/g,
    /\blimited\b/g,
    /\bltd\s*\.?\b/g,
    /\bllp\b/g,
    /\bllc\b/g,
    /\benterprises\b/g,
    /\bindustries\b/g,
    /\bworks\b/g,
    /\bmills\b/g,
    /\bmill\b/g,
    /\bfactory\b/g,
    /\bfactories\b/g,
    /\bagency\b/g,
    /\bagencies\b/g,
    /\bcompany\b/g,
    /\bco\s*\.?\b/g,
    /\btraders\b/g,
    /\btrading\b/g,
    /\bcorp\s*\.?\b/g,
    /\bcorporation\b/g,
    /\band\b/g,
    /&/g
  ];

  for (const regex of stopWords) {
    str = str.replace(regex, ' ');
  }

  // Remove non-alphanumeric characters except spaces
  str = str.replace(/[^a-z0-9\s]/g, ' ');
  // Compress multiple whitespaces
  str = str.replace(/\s+/g, ' ').trim();
  
  return str;
}

/**
 * Normalizes Domain URL
 */
function normalizeDomain(url) {
  if (!url || typeof url !== 'string') return null;
  let clean = url.trim().toLowerCase();
  
  // Add protocol if missing to parse with URL
  if (!/^https?:\/\//i.test(clean)) {
    clean = 'http://' + clean;
  }

  try {
    const parsed = new URL(clean);
    let host = parsed.hostname;
    // Strip leading www.
    if (host.startsWith('www.')) {
      host = host.substring(4);
    }
    // Basic domain validation
    if (host.includes('.') && host.length >= 4) {
      return host;
    }
  } catch {
    // Return null if malformed
  }
  return null;
}

/**
 * Matches an input text to the most relevant Category A-Q
 */
function categorizeIndustry(text) {
  if (!text || typeof text !== 'string') return { category: 'Q', subcategory: 'General MSME' };
  const lower = text.toLowerCase();

  for (const [key, data] of Object.entries(MSME_CATEGORIES)) {
    // Check main name
    if (lower.includes(data.name.toLowerCase())) {
      return { category: key, subcategory: data.subcategories[0] };
    }
    // Check subcategories
    for (const sub of data.subcategories) {
      if (lower.includes(sub.toLowerCase())) {
        return { category: key, subcategory: sub };
      }
    }
  }

  // Keyword heuristics
  if (lower.match(/textile|cotton|garment|cloth|fabric|saree|weaving|knitwear|yarn/)) return { category: 'D', subcategory: 'Woven Fabrics' };
  if (lower.match(/food|spice|oil|bakery|snack|namkeen|flour|dairy|tea|grain/)) return { category: 'C', subcategory: 'Spices & Condiments' };
  if (lower.match(/auto|gear|bearing|engine|clutch|cnc|machin|valve|pump/)) return { category: 'F', subcategory: 'Auto Components' };
  if (lower.match(/pack|box|corrugat|print|label|bag/)) return { category: 'G', subcategory: 'Corrugated Boxes' };
  if (lower.match(/furnitur|sofa|wood|craft|marble|carpet/)) return { category: 'E', subcategory: 'Wooden Furniture' };
  if (lower.match(/export|importer|overseas/)) return { category: 'I', subcategory: 'Engineering Goods Export' };
  if (lower.match(/build|cement|tile|ceramic|sanitary|pipe|paint|hardware/)) return { category: 'J', subcategory: 'Tiles & Ceramics' };
  if (lower.match(/clinic|hospital|doctor|dental|patholog|diagno|lab/)) return { category: 'K', subcategory: 'Dental Clinics' };
  if (lower.match(/hotel|restaurant|resort|cafe|lodge|banquet/)) return { category: 'L', subcategory: 'Restaurants & Cafes' };
  if (lower.match(/retail|shop|store|showroom|jewel/)) return { category: 'M', subcategory: 'Retail Shops and Specialty Stores' };
  if (lower.match(/school|college|institute|academy|coaching|training/)) return { category: 'N', subcategory: 'Coaching Classes' };
  if (lower.match(/transport|cargo|logistics|warehouse|godown/)) return { category: 'P', subcategory: 'Logistics, Transport, and Warehousing' };
  if (lower.match(/fabricat|metal|steel|iron|foundry|casting/)) return { category: 'A', subcategory: 'Industrial Fabrications' };

  return { category: 'Q', subcategory: 'Other Relevant MSME Sectors' };
}

module.exports = {
  INDIAN_STATES_AND_UTS,
  MAJOR_INDUSTRIAL_CLUSTERS,
  MSME_CATEGORIES,
  normalizeIndianPhone,
  normalizePincode,
  normalizeBusinessName,
  normalizeDomain,
  categorizeIndustry
};
