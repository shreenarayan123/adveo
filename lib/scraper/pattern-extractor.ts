import { openai } from '../openai';
import { prisma } from '../prisma';

const THEME_POOL = ['luxury', 'nature', 'urban', 'studio', 'minimalist'] as const;

function normalizeText(value: string | null | undefined): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function buildAdSummaries(ads: Array<{
  advertiser: string;
  daysRunning: number;
  headline: string | null;
  description: string | null;
  callToAction: string | null;
  detectedTheme: string | null;
}>) {
  return ads.map((ad, index) => [
    `AD ${index + 1}:`,
    `- Advertiser: ${normalizeText(ad.advertiser)}`,
    `- Days Running: ${ad.daysRunning}`,
    `- Detected Theme: ${normalizeText(ad.detectedTheme) || 'unknown'}`,
    `- Headline: ${normalizeText(ad.headline)}`,
    `- Description: ${normalizeText(ad.description)}`,
    `- CTA: ${normalizeText(ad.callToAction)}`,
  ].join('\n')).join('\n\n');
}

export async function extractPatternsForCategory(category: string) {
  console.log(`\n🧠 Extracting patterns for ${category}...`);

  const ads = await prisma.scrapedAd.findMany({
    where: { category },
    orderBy: { daysRunning: 'desc' },
    take: 50,
  });

  if (ads.length === 0) {
    console.log(`  ⚠️  No scraped ads found for ${category}`);
    return;
  }

  const detectedThemes = Array.from(new Set(
    ads
      .map((ad) => normalizeText(ad.detectedTheme).toLowerCase())
      .filter(Boolean)
  ));

  const themesToAnalyze = detectedThemes.length > 0 ? detectedThemes : [...THEME_POOL];

  for (const theme of themesToAnalyze) {
    const themedAds = ads.filter((ad) => {
      const detected = normalizeText(ad.detectedTheme).toLowerCase();
      return detected ? detected === theme : true;
    });

    if (themedAds.length === 0) {
      continue;
    }

    console.log(`  Analyzing ${theme} theme with ${themedAds.length} ads...`);

    const adSummaries = buildAdSummaries(themedAds);
    const prompt = [
      `You are analyzing successful product ads in the ${category} category with a ${theme} aesthetic.`,
      '',
      'These ads have been running for 90+ days and are likely high performers:',
      '',
      adSummaries,
      '',
      'Extract common patterns and return ONLY valid JSON with this exact shape:',
      '{',
      '  "hooks": ["5-7 common opening hooks/headlines"],',
      '  "narratives": ["5-7 story structures"],',
      '  "cameraAngles": ["5-7 visual/camera descriptions"],',
      '  "taglines": ["5-7 memorable closing lines"],',
      `  "visualStyles": ["5-7 visual style descriptions for ${theme}"]`,
      '}',
      '',
      'Focus on repeated ideas, phrasing, and visual patterns. Keep the output concise and practical for prompt engineering.',
    ].join('\n');

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a creative analyst. Return only valid JSON with no markdown formatting.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      });

      const raw = response.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(raw);

      await prisma.adPattern.upsert({
        where: {
          category_theme: {
            category,
            theme,
          },
        },
        update: {
          patterns: parsed,
          adCount: themedAds.length,
          lastUpdated: new Date(),
        },
        create: {
          category,
          theme,
          patterns: parsed,
          adCount: themedAds.length,
          lastUpdated: new Date(),
        },
      });

      console.log(`    ✓ Extracted ${theme} patterns from ${themedAds.length} ads`);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } catch (error) {
      console.error(`    ✗ Error extracting ${theme} patterns:`, error);
    }
  }

  console.log(`✅ Patterns extracted for ${category}`);
}

export async function extractPatternsForAllCategories(categories: string[]) {
  for (const category of categories) {
    await extractPatternsForCategory(category);
  }
}
