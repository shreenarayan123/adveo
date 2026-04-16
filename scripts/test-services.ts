/**
 * ElevenLabs + Cloudinary Integration Test
 * Run with: npx tsx scripts/test-services.ts
 * Tests ElevenLabs TTS and Cloudinary upload in isolation.
 * No OpenAI or Vertex AI calls.
 */

import * as dotenv from 'dotenv';
import { v2 as cloudinary } from 'cloudinary';

dotenv.config();

// ─── Cloudinary Setup ────────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ─── ElevenLabs Test ─────────────────────────────────────────────────────────
async function testElevenLabs(): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is missing in .env');

  const VOICE_ID = 'pNInz6obpgDQGcFmaJgB'; // Adam — hardcoded for test
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: 'Adveo test. Connection confirmed.',
      model_id: 'eleven_turbo_v2_5',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ElevenLabs HTTP ${response.status}: ${body}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 1000) throw new Error('Audio buffer too small — likely an error response');
  return buffer;
}

// ─── Cloudinary Test ─────────────────────────────────────────────────────────
async function testCloudinaryPing(): Promise<string> {
  // Just check account credentials by pinging the usage API
  return new Promise((resolve, reject) => {
    cloudinary.api.usage((error: any, result: any) => {
      if (error) return reject(new Error('Cloudinary ping failed: ' + JSON.stringify(error)));
      resolve(`Credits used: ${result.credits?.usage ?? 'n/a'}, Storage: ${result.storage?.usage_bytes ?? 'n/a'} bytes`);
    });
  });
}

async function testCloudinaryUpload(audioBuffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { public_id: `adveo-test-${Date.now()}`, resource_type: 'auto', folder: 'adveo-tests' },
      (error, result) => {
        if (error) return reject(new Error('Cloudinary upload failed: ' + JSON.stringify(error)));
        if (result) return resolve(result.secure_url);
        reject(new Error('No result from Cloudinary upload'));
      }
    );
    stream.end(audioBuffer);
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🎙️  Testing ElevenLabs + Cloudinary...\n');

  // ── ElevenLabs ──
  console.log('Step 1/3 — ElevenLabs TTS...');
  let audioBuffer: Buffer;
  try {
    audioBuffer = await testElevenLabs();
    console.log(`✅ ElevenLabs OK! Audio size: ${(audioBuffer.length / 1024).toFixed(1)} KB\n`);
  } catch (err: any) {
    console.error('❌ ElevenLabs FAILED:', err.message);
    process.exit(1);
  }

  // ── Cloudinary ping ──
  console.log('Step 2/3 — Cloudinary credentials ping...');
  try {
    const info = await testCloudinaryPing();
    console.log(`✅ Cloudinary credentials valid! ${info}\n`);
  } catch (err: any) {
    console.error('❌ Cloudinary credentials FAILED:', err.message);
    process.exit(1);
  }

  // ── Cloudinary upload ──
  console.log('Step 3/3 — Cloudinary upload (using ElevenLabs audio)...');
  try {
    const uploadedUrl = await testCloudinaryUpload(audioBuffer!);
    console.log(`✅ Cloudinary upload OK!`);
    console.log(`   🔗 URL: ${uploadedUrl}\n`);
    console.log('🎉 All checks passed! ElevenLabs + Cloudinary are fully working!\n');
  } catch (err: any) {
    console.error('❌ Cloudinary upload FAILED:', err.message);
    process.exit(1);
  }
}

main();
