import { scrapeAllCategories } from '../lib/scraper/meta-scraper';

async function main() {
  console.log('='.repeat(60));
  console.log('META AD LIBRARY SCRAPER');
  console.log('='.repeat(60));
  console.log('\nThis will:');
  console.log('1. Scrape 50+ ads across 10 categories');
  console.log('2. Filter ads running for 90+ days');
  console.log('3. Extract patterns with GPT-4');
  console.log('4. Store ads and patterns in Prisma');
  console.log('');

  const mode = process.env.META_AD_LIBRARY_USE_PERSISTENT === 'false'
    ? 'Storage state mode'
    : 'Persistent browser mode';
  console.log(`Mode: ${mode}`);
  if (process.env.META_AD_LIBRARY_HEADLESS !== 'true') {
    console.log('Browser: headful (recommended for Meta)');
  }
  console.log('');

  const proceed = process.argv.includes('--yes');

  if (!proceed) {
    console.log('Run with --yes to proceed');
    process.exit(0);
  }

  await scrapeAllCategories();

  console.log('\n' + '='.repeat(60));
  console.log('DONE! Patterns are ready for script generation.');
  console.log('='.repeat(60));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
