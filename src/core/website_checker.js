// src/core/website_checker.js - Safe, polite website availability and digital need auditor
const https = require('node:https');
const http = require('node:http');
const { URL } = require('node:url');

/**
 * Performs a polite, non-intrusive HTTP GET check with strict timeouts
 */
async function fetchHeadOrGet(targetUrl, timeoutMs = 6000) {
  return new Promise((resolve) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`);
    } catch (err) {
      return resolve({
        success: false,
        error: `Invalid URL format: ${err.message}`,
        statusCode: null
      });
    }

    const client = parsedUrl.protocol === 'https:' ? https : http;
    const startTime = Date.now();

    const req = client.get(
      parsedUrl,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; BharatGrowthBot/1.0; +https://bharatgrowth.example.in)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        timeout: timeoutMs
      },
      (res) => {
        const responseTimeMs = Date.now() - startTime;
        let data = '';

        // Read up to 256KB to analyze meta tags and mobile viewport
        res.on('data', (chunk) => {
          if (data.length < 262144) {
            data += chunk.toString();
          }
        });

        res.on('end', () => {
          resolve({
            success: res.statusCode >= 200 && res.statusCode < 400,
            statusCode: res.statusCode,
            responseTimeMs,
            finalUrl: res.headers.location || targetUrl,
            headers: res.headers,
            isHttps: parsedUrl.protocol === 'https:',
            bodyPreview: data
          });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolve({
        success: false,
        error: 'Connection timed out',
        statusCode: null,
        responseTimeMs: timeoutMs
      });
    });

    req.on('error', (err) => {
      resolve({
        success: false,
        error: err.message,
        statusCode: null,
        responseTimeMs: Date.now() - startTime
      });
    });
  });
}

/**
 * Analyzes HTML body preview for mobile readiness, social links, CMS tech, and copyright year
 */
function analyzeHtmlPreview(html = '') {
  const result = {
    mobileFriendly: false,
    hasSsl: false,
    title: '',
    hasMetaDescription: false,
    copyrightYear: null,
    isLikelyOutdated: false,
    socialProfiles: [],
    hasWhatsAppButton: false,
    detectedCms: null
  };

  if (!html) return result;

  // Viewport check
  if (/<meta[^>]+name=["']viewport["'][^>]*>/i.test(html)) {
    result.mobileFriendly = true;
  }

  // Title tag
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    result.title = titleMatch[1].trim();
  }

  // Meta description
  if (/<meta[^>]+name=["']description["'][^>]*>/i.test(html)) {
    result.hasMetaDescription = true;
  }

  // Copyright year check (e.g. "© 2012", "Copyright 2018")
  const yearMatch = html.match(/(?:©|copyright|\(c\))\s*(?:20\d\d\s*[-–]\s*)?(20[0-2]\d)/i);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    result.copyrightYear = year;
    const currentYear = new Date().getFullYear();
    if (currentYear - year >= 5) {
      result.isLikelyOutdated = true;
    }
  }

  // Social profile links
  const socialPatterns = [
    { platform: 'facebook', regex: /href=["'](https?:\/\/(?:www\.)?facebook\.com\/[^"'\s]+)["']/i },
    { platform: 'instagram', regex: /href=["'](https?:\/\/(?:www\.)?instagram\.com\/[^"'\s]+)["']/i },
    { platform: 'linkedin', regex: /href=["'](https?:\/\/(?:www\.)?linkedin\.com\/[^"'\s]+)["']/i },
    { platform: 'youtube', regex: /href=["'](https?:\/\/(?:www\.)?youtube\.com\/[^"'\s]+)["']/i }
  ];

  for (const s of socialPatterns) {
    const m = html.match(s.regex);
    if (m) {
      result.socialProfiles.push({ platform: s.platform, url: m[1] });
    }
  }

  // WhatsApp chat link
  if (/(?:api\.whatsapp\.com\/send|wa\.me\/\d+)/i.test(html)) {
    result.hasWhatsAppButton = true;
  }

  // CMS generator
  if (/wp-content|wp-includes/i.test(html)) result.detectedCms = 'WordPress';
  else if (/shopify/i.test(html)) result.detectedCms = 'Shopify';
  else if (/wix\.com/i.test(html)) result.detectedCms = 'Wix';
  else if (/weebly/i.test(html)) result.detectedCms = 'Weebly';

  return result;
}

/**
 * Main assessment function for a lead record
 */
async function assessDigitalPresence(lead) {
  const now = new Date().toISOString();
  const evidence = Array.isArray(lead.evidence) ? [...lead.evidence] : [];

  // Case 1: No website provided or found
  if (!lead.website || lead.website.trim() === '') {
    evidence.push({
      timestamp: now,
      checkType: 'DOMAIN_DISCOVERY_CHECK',
      source: lead.source_name || 'System Assessment',
      rawEvidence: 'No domain URL recorded in primary source or listing',
      note: 'Classified as NO_WEBSITE_FOUND after discovery check'
    });

    return {
      website_status: 'NO_WEBSITE_FOUND',
      last_verification_date: now,
      digital_assessment: {
        hasWebsite: false,
        observableNeeds: [
          'High priority candidate for Modern Starter Website (Responsive & Secure)',
          'Needs Google Business Profile presence and digital catalogue'
        ]
      },
      evidence
    };
  }

  // Case 2: Website URL exists -> Check availability
  const fetchResult = await fetchHeadOrGet(lead.website);

  if (!fetchResult.success) {
    evidence.push({
      timestamp: now,
      checkType: 'HTTP_AVAILABILITY_CHECK',
      source: lead.website,
      rawEvidence: `HTTP request failed: ${fetchResult.error || `Status code ${fetchResult.statusCode}`}`,
      note: 'Website domain exists but failed technical availability probe'
    });

    return {
      website_status: 'WEBSITE_UNAVAILABLE',
      last_verification_date: now,
      digital_assessment: {
        hasWebsite: true,
        reachable: false,
        error: fetchResult.error,
        statusCode: fetchResult.statusCode,
        observableNeeds: [
          'Website unavailable or broken; immediate technical recovery / rebuild opportunity'
        ]
      },
      evidence
    };
  }

  // Case 3: Website reached -> Analyze content
  const htmlAnalysis = analyzeHtmlPreview(fetchResult.bodyPreview);
  htmlAnalysis.hasSsl = fetchResult.isHttps;
  htmlAnalysis.responseTimeMs = fetchResult.responseTimeMs;
  htmlAnalysis.statusCode = fetchResult.statusCode;

  const observableNeeds = [];
  let isOutdatedOrDegraded = false;

  if (!htmlAnalysis.mobileFriendly) {
    observableNeeds.push('Missing viewport tag: poor mobile device user experience');
    isOutdatedOrDegraded = true;
  }
  if (!htmlAnalysis.hasSsl) {
    observableNeeds.push('Insecure connection (HTTP without SSL): browser warning risk');
    isOutdatedOrDegraded = true;
  }
  if (htmlAnalysis.isLikelyOutdated) {
    observableNeeds.push(`Copyright year (${htmlAnalysis.copyrightYear}) indicates stale content`);
    isOutdatedOrDegraded = true;
  }
  if (!htmlAnalysis.hasWhatsAppButton) {
    observableNeeds.push('No direct WhatsApp quick-inquiry integration for buyers');
  }
  if (htmlAnalysis.socialProfiles.length === 0) {
    observableNeeds.push('No linked active social media channels found');
  }

  htmlAnalysis.observableNeeds = observableNeeds;

  const status = isOutdatedOrDegraded ? 'WEBSITE_OUTDATED' : 'WEBSITE_CONFIRMED';

  evidence.push({
    timestamp: now,
    checkType: 'DEEP_PAGE_INSPECTION',
    source: lead.website,
    rawEvidence: `Status ${fetchResult.statusCode}, Latency ${fetchResult.responseTimeMs}ms, Mobile: ${htmlAnalysis.mobileFriendly}, SSL: ${htmlAnalysis.hasSsl}`,
    note: `Assessed as ${status}`
  });

  return {
    website_status: status,
    last_verification_date: now,
    digital_assessment: htmlAnalysis,
    evidence
  };
}

module.exports = {
  fetchHeadOrGet,
  analyzeHtmlPreview,
  assessDigitalPresence
};
