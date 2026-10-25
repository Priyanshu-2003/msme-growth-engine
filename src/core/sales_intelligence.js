// src/core/sales_intelligence.js - Personalized AI Sales Brief & Multilingual Outreach Generator
const { MSME_CATEGORIES } = require('./taxonomy.js');

/**
 * Generates an evidence-backed sales intelligence brief for sales reps
 */
function generateSalesBrief(lead) {
  const cat = MSME_CATEGORIES[lead.industry_category] || { name: 'MSME Business', servicesPriority: ['Starter websites'] };
  const webStatus = lead.website_status;
  const da = lead.digital_assessment || {};

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

  // 3. Primary service offer selection based on evidence
  let primaryServiceOffer = 'Starter websites';
  let whyRelevant = '';
  let introductoryOffer = '';

  if (webStatus === 'NO_WEBSITE_FOUND' || webStatus === 'WEBSITE_UNAVAILABLE') {
    if (['A', 'D', 'F', 'H', 'I'].includes(lead.industry_category)) {
      primaryServiceOffer = 'Product catalogues and B2B catalogues';
      whyRelevant = `As an industrial ${lead.subcategory || 'producer'} in ${lead.city}, prospective B2B dealers and buyers cannot view technical product specifications or send direct WhatsApp inquiries without a dedicated digital catalogue.`;
      introductoryOffer = '₹7,999/- one-time: 1-Page B2B Product Catalogue + WhatsApp Inquiry Integration + Domain & SSL Setup for Year 1.';
    } else {
      primaryServiceOffer = 'Starter websites';
      whyRelevant = `Prospective customers searching for ${lead.subcategory || cat.name} in ${lead.city} cannot discover or verify the business online.`;
      introductoryOffer = '₹5,999/- one-time: Mobile-responsive Starter Website (5 pages) + Google Maps listing optimization.';
    }
  } else if (webStatus === 'WEBSITE_OUTDATED') {
    primaryServiceOffer = 'Website maintenance & Modernization';
    whyRelevant = `Existing website (${lead.website}) suffers from mobile usability gaps or outdated security, causing loss of mobile buyer inquiries.`;
    introductoryOffer = '₹6,499/- one-time redesign + 3 months free maintenance and WhatsApp quick-chat.';
  } else if (lead.industry_category === 'I') {
    primaryServiceOffer = 'Export-market digital positioning';
    whyRelevant = 'Operating in international trade requires credible global digital credentials and multi-currency product displays.';
    introductoryOffer = '₹14,999/-: Global Export B2B Showcase with product spec sheets & verified contact verification.';
  } else {
    primaryServiceOffer = 'SEO and local search optimization';
    whyRelevant = `Website exists, but local organic visibility for high-intent search queries in ${lead.city} can drive direct customer inquiries.`;
    introductoryOffer = '₹4,500/month pilot: Google Business Profile local 3-pack optimization + keyword ranking improvement.';
  }

  const keyObservableOpportunity = da.observableNeeds && da.observableNeeds.length > 0
    ? da.observableNeeds[0]
    : `Establish direct digital discoverability for ${lead.business_name} in ${lead.city}.`;

  // 4. Personalized Outreach Drafts (English & Hindi)
  const outreachEmailEn = `Subject: Quick question regarding ${lead.business_name}'s online catalog in ${lead.city}

Dear Team at ${lead.business_name},

I came across your work in ${lead.subcategory || cat.name} in ${lead.city}. 

While researching businesses in ${lead.city}'s industrial ecosystem, I noticed that ${webStatus === 'NO_WEBSITE_FOUND' ? `there isn't an official online product catalog or website where buyers can easily explore your complete range and send inquiries` : `your website (${lead.website || ''}) could benefit from mobile optimization and direct WhatsApp ordering`}.

We specialize in helping Indian MSMEs in ${cat.name} establish high-converting digital catalogues that generate direct dealer and customer inquiries.

Would you be open to a brief 5-minute call this Thursday or Friday to see a sample 1-page digital catalogue tailored for ${lead.business_name}?

Best regards,
Lead Generation Team
BharatGrowth AI`;

  const outreachWhatsappEn = `Namaste! Reaching out to the management of ${lead.business_name} in ${lead.city}.

We noticed your business in ${lead.subcategory || cat.name}. Today, many B2B buyers look for an instant mobile catalog with WhatsApp inquiry buttons before placing orders.

${webStatus === 'NO_WEBSITE_FOUND' ? `We saw that ${lead.business_name} does not yet have a dedicated mobile catalogue.` : `We can help upgrade your digital presence to get more direct inquiries.`}

We have created an introductory ₹${introductoryOffer.includes('5,999') ? '5,999' : '7,999'} starter package for ${lead.city} businesses. Can I share a quick 1-minute demo link with you here?`;

  const outreachCallScriptEn = `1. Introduction: "Good day! Am I speaking with the proprietor or sales head of ${lead.business_name}?"
2. Context: "I am calling from BharatGrowth. We work with ${cat.name} businesses across ${lead.state}."
3. Observation: "We noticed your business in ${lead.city}, but observed that buyers cannot easily find a mobile-friendly product catalog for your ${lead.subcategory || 'products'} online."
4. Value Hook: "We help companies set up a professional digital catalogue that connects directly to your WhatsApp for instant inquiries."
5. Close: "Could I send a 2-minute video preview to your WhatsApp number?"`;

  const outreachEmailHi = `विषय: ${lead.city} में ${lead.business_name} के लिए डिजिटल कैटलॉग और बिज़नेस ग्रोथ

नमस्ते ${lead.business_name} टीम,

हमने ${lead.city} में ${lead.subcategory || cat.name} के क्षेत्र में आपके बेहतरीन काम को देखा।

आजकल अधिकांश डीलर और ग्राहक ऑर्डर देने से पहले मोबाइल पर कंपनी की वेबसाइट या डिजिटल कैटलॉग देखना पसंद करते हैं। ${webStatus === 'NO_WEBSITE_FOUND' ? `हमने पाया कि अभी आपका आधिकारिक ऑनलाइन कैटलॉग उपलब्ध नहीं है` : `आपकी वेबसाइट को मोबाइल पर और बेहतर बनाया जा सकता है`}।

भारतग्रोथ (BharatGrowth) भारतीय MSME उद्योगों को सीधे व्हाट्सएप इन्क्वायरी और नई डीलरशिप पाने के लिए डिजिटल प्लेटफॉर्म प्रदान करता है।

क्या हम इस हफ्ते 5 मिनट की बातचीत कर सकते हैं ताकि हम आपको ${lead.business_name} के लिए एक फ्री सैंपल कैटलॉग दिखा सकें?

सादर,
भारतग्रोथ टीम`;

  const outreachWhatsappHi = `नमस्ते! यह संदेश ${lead.city} स्थित ${lead.business_name} के प्रबंधन के लिए है।

हम भारतीय MSME उद्यमों को सीधे नए ग्राहक और B2B ऑर्डर प्राप्त करने में मदद करते हैं। ${webStatus === 'NO_WEBSITE_FOUND' ? `हमने देखा कि आपकी कंपनी का अभी कोई ऑनलाइन कैटलॉग या वेबसाइट नहीं है, जिससे कई ग्राहक आपसे संपर्क नहीं कर पाते।` : `हम आपके डिजिटल प्रेजेंस को मजबूत करके अधिक लीड्स लाने में मदद कर सकते हैं।`}

हमने ${lead.city} के उद्यमियों के लिए एक विशेष इंट्रोडक्टरी ऑफर तैयार किया है। क्या हम आपको व्हाट्सएप पर एक त्वरित 1-मिनट का डेमो भेज सकते हैं?`;

  const outreachCallScriptHi = `1. परिचय: "नमस्ते जी, क्या मेरी बात ${lead.business_name} के मालिक या मुख्य प्रबंधक से हो रही है?"
2. संदर्भ: "मैं भारतग्रोथ टीम से बात कर रहा हूँ। हम ${lead.state} में ${cat.name} इंडस्ट्री के साथ काम करते हैं।"
3. मुख्य समस्या: "हमने देखा कि ${lead.city} में आपका बढ़िया कारोबार है, लेकिन ऑनलाइन खरीदारों के लिए आपकी मोबाइल वेबसाइट या कैटलॉग आसानी से नहीं मिल रहा।"
4. समाधान: "हम बहुत ही किफायती बजट में आपकी पूरी रेंज का डिजिटल कैटलॉग बनाते हैं, जिससे सीधे आपके फोन पर व्हाट्सएप इन्क्वायरी आने लगती है।"
5. कॉल टू एक्शन: "क्या मैं आपको इसी नंबर पर व्हाट्सएप पर एक छोटा सा डेमो लिंक भेज दूँ?"`;

  // 5. Verification checklist for sales rep (strictly marking hypotheses)
  const verificationChecklist = JSON.stringify([
    `[Hypothesis to verify]: Confirm whether ${lead.business_name} is actively manufacturing/supplying ${lead.subcategory || 'goods'}.`,
    `[Verification]: Check if ${lead.phone || 'the provided phone'} connects directly to the owner, purchase manager, or a general receptionist.`,
    `[Verification]: Confirm if they currently distribute product PDFs manually over WhatsApp.`,
    `[Hypothesis to verify]: Ensure decision-maker understands the difference between a static listing and an official company domain.`
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
