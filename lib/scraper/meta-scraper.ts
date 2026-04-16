import crypto from 'crypto';
import { chromium } from 'playwright';
import { prisma } from '../prisma';
import { extractPatternsForCategory } from './pattern-extractor';

export interface ScraperConfig {
  category: string;
  searchKeywords: string[];
  minDaysRunning: number;
  maxAds: number;
}

export type ScrapedAdRecord = {
  adId: string;
  advertiser: string;
  startDateText: string;
  platforms: string[];
  imageUrl: string | null;
  videoUrl: string | null;
  headline: string | null;
  description: string | null;
  callToAction: string | null;
  rawText: string;
};

export const CATEGORIES: ScraperConfig[] = [
  {
    category: 'beauty',
    searchKeywords: ['skincare', 'beauty products', 'cosmetics', 'makeup'],
    minDaysRunning: 90,
    maxAds: 50,
  },
  {
    category: 'electronics',
    searchKeywords: ['headphones', 'smartwatch', 'laptop', 'phone accessories'],
    minDaysRunning: 90,
    maxAds: 50,
  },
  {
    category: 'fashion',
    searchKeywords: ['clothing', 'shoes', 'accessories', 'jewelry'],
    minDaysRunning: 90,
    maxAds: 50,
  },
  {
    category: 'food',
    searchKeywords: ['snacks', 'beverages', 'meal kit', 'supplements'],
    minDaysRunning: 90,
    maxAds: 50,
  },
  {
    category: 'home',
    searchKeywords: ['home decor', 'furniture', 'kitchen', 'bedding'],
    minDaysRunning: 90,
    maxAds: 50,
  },
  {
    category: 'fitness',
    searchKeywords: ['workout', 'gym equipment', 'yoga', 'fitness tracker'],
    minDaysRunning: 90,
    maxAds: 50,
  },
  {
    category: 'pets',
    searchKeywords: ['dog food', 'cat toys', 'pet supplies', 'pet care'],
    minDaysRunning: 90,
    maxAds: 50,
  },
  {
    category: 'tech',
    searchKeywords: ['software', 'app', 'saas', 'tech gadget'],
    minDaysRunning: 90,
    maxAds: 50,
  },
  {
    category: 'automotive',
    searchKeywords: ['car accessories', 'auto parts', 'car care'],
    minDaysRunning: 90,
    maxAds: 50,
  },
  {
    category: 'baby',
    searchKeywords: ['baby products', 'diapers', 'baby toys', 'nursery'],
    minDaysRunning: 90,
    maxAds: 50,
  },
];

const META_SEARCH_URL = 'https://www.facebook.com/ads/library/';
const STORAGE_STATE_PATH = process.env.META_AD_LIBRARY_STORAGE_STATE_PATH;
const USE_PERSISTENT_CONTEXT = process.env.META_AD_LIBRARY_USE_PERSISTENT !== 'false';
const USER_DATA_DIR = process.env.META_AD_LIBRARY_USER_DATA_DIR || '.meta-user-data';
const SCRAPER_HEADLESS = process.env.META_AD_LIBRARY_HEADLESS === 'true';
const SCRAPER_USER_AGENT = process.env.META_AD_LIBRARY_USER_AGENT
  || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sleepWithJitter(baseMs: number, jitterMs = 500) {
  const jitter = Math.floor(Math.random() * Math.max(jitterMs, 1));
  await sleep(baseMs + jitter);
}

function normalizeText(value: string | null | undefined) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseRelativeDate(relativeText: string): Date | null {
  const match = relativeText.match(/(\d+)\s+(day|days|week|weeks|month|months|year|years)\s+ago/i);
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const now = new Date();

  if (unit.startsWith('day')) now.setDate(now.getDate() - amount);
  else if (unit.startsWith('week')) now.setDate(now.getDate() - amount * 7);
  else if (unit.startsWith('month')) now.setMonth(now.getMonth() - amount);
  else if (unit.startsWith('year')) now.setFullYear(now.getFullYear() - amount);

  return now;
}

function parseStartDate(startDateText: string): Date {
  const cleaned = normalizeText(startDateText).replace(/^started running on\s+/i, '');
  const relativeDate = parseRelativeDate(cleaned);
  if (relativeDate) return relativeDate;

  const direct = new Date(cleaned);
  if (!Number.isNaN(direct.getTime())) return direct;

  return new Date();
}

function detectThemeFromText(text: string): string {
  const lower = text.toLowerCase();

  if (/\b(luxury|premium|elegant|exclusive|gold|designer|upscale)\b/.test(lower)) return 'luxury';
  if (/\b(nature|natural|eco|organic|botanical|outdoor|earth)\b/.test(lower)) return 'nature';
  if (/\b(urban|city|street|neon|downtown)\b/.test(lower)) return 'urban';
  if (/\b(minimal|clean|simple|white space|minimalist)\b/.test(lower)) return 'minimalist';
  return 'studio';
}

function extractPlatforms(text: string): string[] {
  const platforms = new Set<string>();
  if (/instagram/i.test(text)) platforms.add('Instagram');
  if (/facebook/i.test(text)) platforms.add('Facebook');
  if (/messenger/i.test(text)) platforms.add('Messenger');
  if (/audience network/i.test(text)) platforms.add('Audience Network');
  if (platforms.size === 0) platforms.add('Facebook');
  return Array.from(platforms);
}

function getAdIdFromUrl(url: string | null, fallbackSeed: string): string {
  if (!url) return '';
  const idMatch = url.match(/[?&]id=(\d+)/i);
  if (idMatch) return idMatch[1];
  const fallback = url.match(/\/ads\/library\/?([^?]+)/i);
  if (fallback?.[1]) return fallback[1];
  return `scraped-${crypto.createHash('sha1').update(fallbackSeed).digest('hex').slice(0, 16)}`;
}

async function createMetaContext() {
  const launchArgs = [
    '--disable-blink-features=AutomationControlled',
    '--no-default-browser-check',
  ];

  if (USE_PERSISTENT_CONTEXT) {
    const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
      headless: SCRAPER_HEADLESS,
      locale: 'en-US',
      viewport: { width: 1440, height: 1800 },
      userAgent: SCRAPER_USER_AGENT,
      args: launchArgs,
    });

    return {
      context,
      close: async () => {
        await context.close();
      },
    };
  }

  const browser = await chromium.launch({
    headless: SCRAPER_HEADLESS,
    args: launchArgs,
  });

  const context = await browser.newContext({
    locale: 'en-US',
    viewport: { width: 1440, height: 1800 },
    userAgent: SCRAPER_USER_AGENT,
    storageState: STORAGE_STATE_PATH || undefined,
  });

  return {
    context,
    close: async () => {
      await context.close();
      await browser.close();
    },
  };
}

async function createMetaSession() {
  const { context, close } = await createMetaContext();
  const page = await context.newPage();

  // Keeping one page/session for the full run avoids repeated browser launches and login churn.
  await page.goto('https://www.facebook.com/ads/library/', {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });

  return { context, page, close };
}

async function extractAdsFromPage(page: any, keyword: string): Promise<ScrapedAdRecord[]> {

  try {
    const url = `${META_SEARCH_URL}?active_status=all&ad_type=all&country=US&q=${encodeURIComponent(keyword)}&search_type=keyword_unordered&media_type=all`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await sleepWithJitter(2500, 1200);

    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, 5000);
      await sleepWithJitter(1400, 900);
    }

    const cardLocator = page.locator('[data-testid="search_result_item"], div[role="article"], div:has(a[href*="ads/library/?id="])');
    const cardCount = await cardLocator.count();
    const ads = [] as ScrapedAdRecord[];

    if (cardCount === 0) {
      const adLinkCount = await page.locator('a[href*="ads/library/?id="]').count();
      const loginPromptCount = await page.locator('text=/log in/i').count();
      const blockedSignalCount = await page.locator('text=/temporarily blocked|suspicious activity|try again later/i').count();
      console.warn(
        `  ⚠️ No ad cards detected for keyword "${keyword}". adLinks=${adLinkCount}, loginPrompts=${loginPromptCount}, blockedSignals=${blockedSignalCount}`
      );
    }

    for (let index = 0; index < cardCount; index++) {
      const card = cardLocator.nth(index);
      const text = normalizeText(await card.innerText().catch(() => ''));
      if (!text) {
        continue;
      }

      const link = await card.locator('a[href*="/ads/library"], a[href*="id="]').first().getAttribute('href').catch(() => null);
      const imageUrl = await card.locator('img').first().getAttribute('src').catch(() => null);
      const videoUrl = await card.locator('video source').first().getAttribute('src').catch(() => null)
        || await card.locator('video').first().getAttribute('src').catch(() => null);

      const headlineText = normalizeText(await card.locator('h1, h2, h3, h4, strong').first().innerText().catch(() => ''));
      const bodyText = normalizeText(await card.locator('p, [class*="body"], [class*="description"]').first().innerText().catch(() => ''));
      const buttonText = normalizeText(await card.locator('button, [role="button"], [class*="cta"]').first().innerText().catch(() => ''));
      const advertiserText = normalizeText(await card.locator('[class*="advertiser"], [role="heading"], h2, h3, strong').first().innerText().catch(() => ''));

      const headline = headlineText || (text.match(/Headline[:\s]+([^\n•]{2,120})/i)?.[1] || '').trim() || null;
      const description = bodyText || (text.match(/Description[:\s]+([^\n•]{2,200})/i)?.[1] || '').trim() || null;
      const callToAction = buttonText || (text.match(/(Shop Now|Learn More|Sign Up|Get Offer|Download|Apply Now|Buy Now)/i)?.[1] || '').trim() || null;
      const advertiser = advertiserText || (text.match(/^([^•\n]{2,80})/)?.[1] || '').trim() || '';
      const started = (text.match(/Started running on\s+([^•\n]+)/i)?.[1] || text.match(/Started\s+([^•\n]+)/i)?.[1] || text.match(/(\d+\s+(?:day|days|week|weeks|month|months|year|years) ago)/i)?.[1] || '').trim();

      ads.push({
        adId: link || '',
        advertiser,
        startDateText: started,
        platforms: text,
        imageUrl,
        videoUrl,
        headline,
        description,
        callToAction,
        rawText: text,
      });
    }

    return ads
      .map((ad) => ({
        adId: getAdIdFromUrl(ad.adId, `${keyword}|${ad.advertiser}|${ad.headline}|${ad.description}|${ad.startDateText}`),
        advertiser: normalizeText(ad.advertiser),
        startDateText: normalizeText(ad.startDateText),
        platforms: extractPlatforms(ad.platforms),
        imageUrl: ad.imageUrl,
        videoUrl: ad.videoUrl,
        headline: normalizeText(ad.headline) || null,
        description: normalizeText(ad.description) || null,
        callToAction: normalizeText(ad.callToAction) || null,
        rawText: ad.rawText,
      }))
      .filter((ad) => ad.adId && ad.advertiser);
  } catch (error) {
    throw error;
  }
}

async function saveScrapedAds(category: string, ads: ScrapedAdRecord[], minDaysRunning: number, maxAds: number) {
  const savedAds: ScrapedAdRecord[] = [];

  for (const ad of ads) {
    const startDate = parseStartDate(ad.startDateText);
    const daysRunning = Math.floor((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysRunning < minDaysRunning) {
      continue;
    }

    const detectedTheme = detectThemeFromText([ad.headline, ad.description, ad.callToAction, ad.rawText].filter(Boolean).join(' '));

    await prisma.scrapedAd.upsert({
      where: { adId: ad.adId },
      update: {
        advertiser: ad.advertiser,
        category,
        platform: ad.platforms,
        startDate,
        daysRunning,
        imageUrl: ad.imageUrl,
        videoUrl: ad.videoUrl,
        headline: ad.headline,
        description: ad.description,
        callToAction: ad.callToAction,
        detectedTheme,
        scrapedAt: new Date(),
      },
      create: {
        adId: ad.adId,
        advertiser: ad.advertiser,
        category,
        platform: ad.platforms,
        startDate,
        daysRunning,
        imageUrl: ad.imageUrl,
        videoUrl: ad.videoUrl,
        headline: ad.headline,
        description: ad.description,
        callToAction: ad.callToAction,
        detectedTheme,
      },
    });

    savedAds.push(ad);
    console.log(`    ✓ Saved: ${ad.advertiser} (${daysRunning} days)`);

    if (savedAds.length >= maxAds) {
      break;
    }
  }

  return savedAds;
}

export async function scrapeMetaAdLibrary(config: ScraperConfig, page: any) {
  console.log(`\n🔍 Scraping ${config.category}...`);

  const scrapedAds: ScrapedAdRecord[] = [];

  for (const keyword of config.searchKeywords) {
    if (scrapedAds.length >= config.maxAds) {
      break;
    }

    console.log(`  Searching: ${keyword}`);

    try {
      const ads = await extractAdsFromPage(page, keyword);
      console.log(`  Found ${ads.length} ads`);

      const savedAds = await saveScrapedAds(config.category, ads, config.minDaysRunning, config.maxAds - scrapedAds.length);
      scrapedAds.push(...savedAds);
    } catch (error) {
      console.error(`  ✗ Error scraping keyword "${keyword}":`, error);
    }

    if (scrapedAds.length >= config.maxAds) {
      break;
    }

    await sleep(2000);
  }

  console.log(`✅ Scraped ${scrapedAds.length} ads for ${config.category}`);
  return scrapedAds;
}

export async function scrapeAllCategories() {
  console.log('🚀 Starting Meta Ad Library scraper...');

  const session = await createMetaSession();

  try {
    for (const category of CATEGORIES) {
      await scrapeMetaAdLibrary(category, session.page);
      await extractPatternsForCategory(category.category);
      await sleep(5000);
    }
  } finally {
    await session.close();
  }

  console.log('✅ All categories scraped!');
}
