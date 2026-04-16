import { chromium } from 'playwright';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const SESSION_OUTPUT_PATH = process.env.META_AD_LIBRARY_STORAGE_STATE_PATH || 'state.json';
const USER_AGENT = process.env.META_AD_LIBRARY_USER_AGENT
  || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    locale: 'en-US',
    viewport: { width: 1440, height: 1800 },
    userAgent: USER_AGENT,
  });

  const page = await context.newPage();
  await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' });

  const rl = createInterface({ input, output });
  await rl.question(
    '\nLog in to Facebook in the opened browser, then press Enter here to save session state...\n'
  );
  rl.close();

  await context.storageState({ path: SESSION_OUTPUT_PATH });
  console.log(`\n✅ Session saved to ${SESSION_OUTPUT_PATH}`);

  await context.close();
  await browser.close();
}

main().catch((error) => {
  console.error('Failed to save Meta session:', error);
  process.exit(1);
});
