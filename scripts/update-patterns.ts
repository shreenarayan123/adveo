import { scrapeAllCategories } from '../lib/scraper/meta-scraper';

async function updatePatterns() {
  console.log('🔄 Updating ad patterns...');
  await scrapeAllCategories();
  console.log('✅ Patterns updated!');
}

updatePatterns().catch((error) => {
  console.error(error);
  process.exit(1);
});
