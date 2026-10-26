// src/core/sales_intelligence.js - Personalized AI Sales Brief & Multilingual Outreach Generator
const { MSME_CATEGORIES } = require('./taxonomy.js');

function renderTemplateVars(tpl, lead, cat) {
  if (!tpl) return tpl;
  return tpl
    .replace(/\{\{business_name\}\}/g, lead.business_name || 'your company')
    .replace(/\{\{city\}\}/g, lead.city || 'your city')
    .replace(/\{\{state\}\}/g, lead.state || 'your state')
    .replace(/\{\{subcategory\}\}/g, lead.subcategory || cat.name || 'products');
}

/**
 * Generates an evidence-backed sales intelligence brief for sales reps
 */
function generateSalesBrief(lead, customDb = null) {
  const cat = MSME_CATEGORIES[lead.industry_category] || { name: 'MSME Business', servicesPriority: ['Starter websites'] };
  const webStatus = lead.website_status;
  const da = lead.digital_assessment || {};

  let db = customDb;
  if (!db) {
    try {
      const { getDb } = require('../db/index.js');
      db = getDb();
    } catch (e) {}
  }

  const getDbScript = (key) => {
    if (!db) return null;
    try {
      const row = db.prepare('SELECT content FROM scripts WHERE script_key = ? ORDER BY version DESC LIMIT 1').get(key);
      return row ? row.content : null;
    } catch (e) {
      return null;
    }
  };

  // 1. What the business does
  const businessSummary = `${lead.business_name} is a ${lead.entity_type !== 'UNKNOWN' ? lead.entity_type.toLowerCase() : 'commercial'} enterprise operating in ${lead.city}, ${lead.state}, specializing in ${lead.subcategory || cat.name}.`;

  // 2. Evidence about online presence
  let onlinePresenceEvidence = '';
  if (webStatus === 'NO_WEBSITE_FOUND') {
    onlinePresenceEvidence = `Discovered via ${lead.source_name}. No verified standalone official domain was found. Discovered contact phone: ${lead.phone || 'None recorded'}.`;
  } else if (webStatus === 'WEBSITE_OUTDATED' || webStatus === 'WEBSITE_UNAVAILABLE') {
    onlinePresenceEvidence = `Recorded website (${lead.website}) status: ${webStatus}. Issues observed: ${da.observableNeeds ? da.observableNeeds.join('; ') : 'Site technically unreachable or non-responsive'}.`;
  } else {
    onlinePresenceEvidence = `Active domain ${lead.website}. Mobile ready: ${da.mobileFriendly ? 'Yes' : 'No'}. SSL secured: ${da.hasSsl ? 'Yes' : 'No'}. Social links: ${da.socialProfiles && da.socialProfiles.length > 0 ? da.socialProfiles.length : '0'}.`;
  }

  // 3. Primary service offer: Single Core Offer
  // "Get buyer enquiries from your own B2B catalogue" = mobile-friendly catalogue site + WhatsApp enquiry button + Google Business Profile setup.
  const primaryServiceOffer = 'B2B Catalogue with WhatsApp Enquiries';
  const whyRelevant = webStatus === 'NO_WEBSITE_FOUND' || webStatus === 'WEBSITE_UNAVAILABLE'
    ? `As an MSME ${lead.subcategory || 'business'} in ${lead.city}, outstation B2B dealers and buyers cannot view technical product specifications or send direct WhatsApp enquiries without a dedicated mobile catalogue.`
    : `Existing website (${lead.website}) lacks a mobile-friendly product catalogue and direct WhatsApp enquiry routing, causing loss of mobile buyer enquiries.`;

  const introductoryOffer = '₹7,999 list (₹5,999 Founding Client Special: requires testimonial + referral): Mobile catalogue + WhatsApp enquiry button + Google Business Profile. ₹2,000 UPI advance, balance on delivery.';

  const keyObservableOpportunity = da.observableNeeds && da.observableNeeds.length > 0
    ? da.observableNeeds[0]
    : `Establish direct mobile catalogue & WhatsApp enquiry presence for ${lead.business_name} in ${lead.city}.`;

  // 4. Personalized Outreach Drafts (English & Hindi)
  // Channel Rule: Phone call first; WhatsApp audit sent only after verbal consent.
  const outreachEmailEn = `Subject: Quick question regarding ${lead.business_name}'s product catalogue in ${lead.city}

Dear Team at ${lead.business_name},

I came across your business in ${lead.subcategory || cat.name} in ${lead.city}.

While researching suppliers in ${lead.city}'s industrial cluster, I noticed that ${webStatus === 'NO_WEBSITE_FOUND' ? `there isn't an official online mobile catalogue where buyers can view your products and send direct WhatsApp enquiries` : `your website (${lead.website || ''}) does not have a direct WhatsApp enquiry button or mobile-first catalogue layout`}.

We specialize in setting up high-converting mobile B2B catalogues with WhatsApp enquiry buttons and Google Business Profile setup for Indian MSMEs.

Our standard package is ₹7,999, but we are offering our first 3 founding clients in ${lead.city} a rate of ₹5,999 (₹2,000 advance to begin, balance on delivery) in exchange for a testimonial and case study.

Would you be open to a brief 5-minute call this week to see a sample 1-page digital catalogue tailored for ${lead.business_name}?

Best regards,
Lead Generation Team
BharatGrowth AI`;

  const defaultWhatsappEn = `Namaste! As discussed during our call regarding ${lead.business_name} in ${lead.city}:

Here is your 1-page Online Presence & Catalogue Audit Report.

Key Deliverables of our Core Package:
1. Mobile-friendly B2B Product Catalogue (tested on all phones)
2. Direct WhatsApp Enquiry Button (buyers tap to message your phone directly)
3. Google Business Profile Setup (so local & outstation buyers discover you)

Pricing:
• Standard List Price: ₹7,999
• Founding Client Special: ₹5,999 (for the first 3 clients who provide a testimonial and referral)
• Terms: ₹2,000 UPI advance to begin, balance on delivery.

Would you like me to share a 1-minute live demo link customized for your sector?`;

  const defaultCallScriptEn = `1. Introduction: "Namaste! Am I speaking with the proprietor or managing director of ${lead.business_name}?"
2. Context: "I am calling from BharatGrowth. We work with MSME manufacturers and suppliers across ${lead.city}."
3. Observation: "We noticed your business, but observed that buyers cannot easily find a mobile-friendly product catalogue for your ${lead.subcategory || 'products'} online."
4. Value Hook: "We help MSMEs set up a professional mobile B2B catalogue with a direct WhatsApp enquiry button and Google Business Profile setup so buyers can enquire instantly."
5. Founding Offer & Consent: "We are offering a founding client special of ₹5,999 (₹2,000 advance) for 3 businesses who give a testimonial. May I send a 1-page WhatsApp audit report of your online presence to this number for you to review?"`;

  const defaultWhatsappHi = `नमस्ते! जैसा कि हमने फोन पर चर्चा की थी, यह संदेश ${lead.business_name} (${lead.city}) के लिए है:

हम MSME उद्यमों के लिए "B2B कैटलॉग + व्हाट्सएप इन्क्वायरी + गूगल बिज़नेस प्रोफ़ाइल" तैयार करते हैं ताकि बाहर के व्यापारी सीधे आपके व्हाट्सएप पर ऑर्डर भेज सकें।

पैकेज और फीस:
• लिस्ट प्राइस: ₹7,999
• फाउंडिंग क्लाइंट ऑफर: ₹5,999 (पहले 3 क्लाइंट्स के लिए टेस्टिमोनियल के साथ)
• शर्तें: ₹2,000 UPI एडवांस, बाकी कैटलॉग लाइव होने पर।

क्या मैं आपको आपके सेक्टर का 1-मिनट का लाइव डेमो लिंक भेज दूँ?`;

  const defaultCallScriptHi = `1. परिचय: "नमस्ते जी, क्या मेरी बात ${lead.business_name} के प्रोपराइटर या संचालक से हो रही है?"
2. संदर्भ: "मैं भारतग्रोथ से बात कर रहा हूँ। हम ${lead.city} में MSME निर्माताओं के साथ काम करते हैं।"
3. मुख्य समस्या: "हमने देखा कि ${lead.city} में आपका बढ़िया कारोबार है, लेकिन ऑनलाइन खरीदारों के लिए मोबाइल पर आपका प्रोडक्ट कैटलॉग और सीधा व्हाट्सएप बटन उपलब्ध नहीं है।"
4. समाधान: "हम आपके लिए एक आसान मोबाइल B2B कैटलॉग बनाते हैं, जिससे व्यापारी सीधे आपके फोन पर व्हाट्सएप इन्क्वायरी भेज सकते हैं, साथ में गूगल बिज़नेस प्रोफ़ाइल भी सेटअप करते हैं।"
5. फाउंडिंग ऑफर और सहमति: "पहले 3 फाउंडिंग क्लाइंट्स के लिए हमारा ऑफर ₹5,999 है (₹2,000 एडवांस)। क्या मैं आपके इसी व्हाट्सएप नंबर पर 1-पेज की ऑडिट रिपोर्ट भेज दूँ ताकि आप इसे देख सकें?"`;

  const outreachWhatsappEn = renderTemplateVars(getDbScript('whatsapp_audit_en'), lead, cat) || defaultWhatsappEn;
  const outreachCallScriptEn = renderTemplateVars(getDbScript('cold_call_en'), lead, cat) || defaultCallScriptEn;
  const outreachWhatsappHi = renderTemplateVars(getDbScript('whatsapp_audit_hi'), lead, cat) || defaultWhatsappHi;
  const outreachCallScriptHi = renderTemplateVars(getDbScript('cold_call_hi'), lead, cat) || defaultCallScriptHi;

  const outreachEmailHi = `विषय: ${lead.city} में ${lead.business_name} के लिए डिजिटल B2B कैटलॉग और खरीदार इन्क्वायरी

नमस्ते ${lead.business_name} टीम,

हमने ${lead.city} में ${lead.subcategory || cat.name} के क्षेत्र में आपके कार्य को देखा।

आजकल B2B खरीदार और डीलर ऑर्डर देने से पहले मोबाइल पर प्रोडक्ट कैटलॉग देखना और सीधे व्हाट्सएप पर पूछताछ करना पसंद करते हैं। ${webStatus === 'NO_WEBSITE_FOUND' ? `हमने पाया कि अभी आपकी कंपनी का आधिकारिक मोबाइल कैटलॉग उपलब्ध नहीं है` : `आपकी वेबसाइट पर मोबाइल कैटलॉग और सीधा व्हाट्सएप बटन उपलब्ध नहीं है`}।

हम भारतीय MSME उद्यमों के लिए 3 मुख्य सुविधाएं तैयार करते हैं:
1. मोबाइल-फ्रेंडली B2B प्रोडक्ट कैटलॉग
2. डायरेक्ट व्हाट्सएप इन्क्वायरी बटन
3. गूगल बिज़नेस प्रोफ़ाइल सेटअप

स्टैंडर्ड पैकेज ₹7,999 है, लेकिन टेस्टिमोनियल और रेफरल देने वाले पहले 3 फाउंडिंग क्लाइंट्स के लिए यह ₹5,999 में उपलब्ध है (शुरुआत के लिए ₹2,000 UPI एडवांस, बाकी डिलीवरी पर)।

क्या हम इस हफ्ते 5 मिनट की बातचीत कर सकते हैं ताकि हम आपको ${lead.business_name} के लिए एक सैंपल कैटलॉग दिखा सकें?

सादर,
भारतग्रोथ टीम`;

  // 5. Verification checklist for sales rep (strictly marking hypotheses)
  const verificationChecklist = JSON.stringify([
    `[Hypothesis to verify]: Confirm whether ${lead.business_name} is actively manufacturing/supplying ${lead.subcategory || 'goods'}.`,
    `[Verification]: Check if ${lead.phone || 'the provided phone'} connects directly to the owner, purchase manager, or a general receptionist.`,
    `[Verification]: Confirm if they currently distribute product photos manually over WhatsApp.`,
    `[Consent Verification]: Ensure verbal consent is received on the phone call before sending the WhatsApp audit report.`
  ]);

  return {
    business_summary: businessSummary,
    online_presence_evidence: onlinePresenceEvidence,
    key_observable_opportunity: keyObservableOpportunity,
    primary_service_offer: primaryServiceOffer,
    why_relevant: whyRelevant,
    introductory_offer: introductoryOffer,
    outreach_email_en: outreachEmailEn,
    outreach_whatsapp_en: outreachWhatsappEn,
    outreach_call_script_en: outreachCallScriptEn,
    outreach_email_hi: outreachEmailHi,
    outreach_whatsapp_hi: outreachWhatsappHi,
    outreach_call_script_hi: outreachCallScriptHi,
    verification_checklist: verificationChecklist
  };
}

module.exports = {
  generateSalesBrief
};
