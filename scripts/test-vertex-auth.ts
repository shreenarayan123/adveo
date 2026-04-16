/**
 * Quick Vertex AI Auth Test
 * Run with: npx tsx scripts/test-vertex-auth.ts
 * Tests ONLY Google auth + a lightweight Vertex AI API call.
 * No OpenAI, ElevenLabs, or DB calls.
 */

import { GoogleAuth } from 'google-auth-library';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID;
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const CREDENTIALS_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS
  ? path.resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS)
  : undefined;

async function main() {
  console.log('\n🔐 Testing Vertex AI Authentication...\n');
  console.log(`   Project ID : ${PROJECT_ID}`);
  console.log(`   Location   : ${LOCATION}`);
  console.log(`   Key File   : ${CREDENTIALS_PATH}`);
  console.log('');

  if (!PROJECT_ID) {
    console.error('❌ GOOGLE_CLOUD_PROJECT_ID is missing in .env!');
    process.exit(1);
  }
  if (!CREDENTIALS_PATH) {
    console.error('❌ GOOGLE_APPLICATION_CREDENTIALS is missing in .env!');
    process.exit(1);
  }

  // --- Step 1: Auth token ---
  let token: string;
  try {
    const auth = new GoogleAuth({
      keyFile: CREDENTIALS_PATH,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    if (!tokenResponse.token) throw new Error('Token is empty');
    token = tokenResponse.token;
    console.log('✅ Step 1/2 — OAuth2 token obtained successfully!');
    console.log(`   Token preview: ${token.substring(0, 20)}...`);
  } catch (err: any) {
    console.error('❌ Step 1/2 — OAuth2 token FAILED:', err.message);
    process.exit(1);
  }

  // --- Step 2: Ping Imagen 4 via :predict endpoint ---
  const MODEL = 'imagen-4.0-generate-001';
  const endpoint = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL}:predict`;

  console.log('\n🌐 Step 2/2 — Pinging Imagen 4 on Vertex AI...');
  console.log(`   URL: ${endpoint}`);
  
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        instances: [{ prompt: 'A white product bottle on a clean studio background.' }],
        parameters: { sampleCount: 1, aspectRatio: '1:1', outputMimeType: 'image/jpeg' },
      }),
    });

    const body = await response.text();

    if (response.ok) {
      const parsed = JSON.parse(body);
      const hasImage = !!parsed.predictions?.[0]?.bytesBase64Encoded;
      console.log(`✅ Step 2/2 — Imagen 4 responded with HTTP ${response.status}`);
      console.log(`   Got image data: ${hasImage ? 'YES ✅' : 'NO ❌'}`);
      console.log('\n🎉 All checks passed! Imagen 4 on Vertex AI is fully working!\n');
    } else {
      console.error(`❌ Step 2/2 — Imagen 4 returned HTTP ${response.status}`);
      console.error('   Response body:', body);
      process.exit(1);
    }
  } catch (err: any) {
    console.error('❌ Step 2/2 — Network error calling Vertex AI:', err.message);
    process.exit(1);
  }
}

main();
