import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const patterns = [
  {
    category: 'electronics',
    theme: 'studio',
    patterns: {
      hooks: ["Problem-solution hooks", "Social proof hooks", "FOMO hooks"],
      narratives: ["Before-after", "Transformation", "Lifestyle upgrade"],
      cameraAngles: ["Close-up product reveal", "360 spin", "Lifestyle context"],
      taglines: ["Call to action examples", "Memorable one-liners"],
      visualStyles: ["Bright lighting", "Cool color palette", "Modern studio scene"]
    },
    adCount: 50,
  },
  {
    category: 'electronics',
    theme: 'luxury',
    patterns: {
      hooks: ["Aspirational hooks", "Premium positioning"],
      narratives: ["Luxury lifestyle", "Exclusivity"],
      cameraAngles: ["Macro close-up", "Slow pan"],
      taglines: ["Luxury call to action", "Elite one-liners"],
      visualStyles: ["Soft gold lighting", "Black/gold palette", "Elegant set"]
    },
    adCount: 30,
  },
  {
    category: 'fashion',
    theme: 'nature',
    patterns: {
      hooks: ["Eco-friendly hooks", "Nature connection"],
      narratives: ["Outdoor adventure", "Natural beauty"],
      cameraAngles: ["Wide landscape", "Dynamic movement"],
      taglines: ["Nature-inspired call to action"],
      visualStyles: ["Natural sunlight", "Earth tones", "Outdoor settings"]
    },
    adCount: 40,
  },
  {
    category: 'fashion',
    theme: 'urban',
    patterns: {
      hooks: ["City life hooks", "Trendsetter"],
      narratives: ["Urban adventure", "Street style"],
      cameraAngles: ["Street-level tracking", "Overhead city shot"],
      taglines: ["Urban call to action"],
      visualStyles: ["Neon lighting", "Monochrome palette", "Cityscape"]
    },
    adCount: 35,
  },
  {
    category: 'beauty',
    theme: 'luxury',
    patterns: {
      hooks: ["Glamour hooks", "Celebrity endorsement"],
      narratives: ["Transformation", "Red carpet"],
      cameraAngles: ["Soft focus close-up", "Mirror shot"],
      taglines: ["Glamorous call to action"],
      visualStyles: ["Soft pink lighting", "Gold accents", "Elegant vanity"]
    },
    adCount: 25,
  },
  {
    category: 'beauty',
    theme: 'minimalist',
    patterns: {
      hooks: ["Simplicity hooks", "Clean beauty"],
      narratives: ["Before-after", "Everyday routine"],
      cameraAngles: ["Static product shot", "Hand model"],
      taglines: ["Minimalist call to action"],
      visualStyles: ["White background", "Soft natural light", "Simple props"]
    },
    adCount: 20,
  },
  // ...add more patterns for other categories/themes as needed
];

async function main() {
  for (const p of patterns) {
    await prisma.adPattern.upsert({
      where: { category_theme: { category: p.category, theme: p.theme } },
      update: { ...p, lastUpdated: new Date() },
      create: { ...p, lastUpdated: new Date() },
    });
  }
  console.log('Seeded ad patterns!');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(() => prisma.$disconnect());
