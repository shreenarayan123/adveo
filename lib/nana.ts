import { GoogleAuth } from 'google-auth-library';
import { uploadBase64ToCloudinary } from './storage';
import * as path from 'path';

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID!;
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
// Imagen 4 model IDs:
// Standard (balanced): imagen-4.0-generate-001
// Ultra (best quality): imagen-4.0-ultra-generate-001
// Fast (cheapest):      imagen-4.0-fast-generate-001
const MODEL = 'imagen-4.0-generate-001';
const CREDENTIALS_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS
  ? path.resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS)
  : undefined;

let authClient: GoogleAuth | null = null;

function getAuthClient() {
  if (!authClient) {
    authClient = new GoogleAuth({
      keyFile: CREDENTIALS_PATH,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
  }
  return authClient;
}

async function getAccessToken(): Promise<string> {
  const auth = getAuthClient();
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  if (!tokenResponse.token) throw new Error('Failed to get Vertex AI access token');
  return tokenResponse.token;
}

async function urlToBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  return Buffer.from(buffer).toString('base64');
}

/**
 * Imagen 4 uses the :predict endpoint with instances/parameters format
 * Docs: https://cloud.google.com/vertex-ai/generative-ai/docs/image/generate-images
 */
async function imagen4Generate(
  prompt: string,
  attempt = 1
): Promise<string> {
  try {
    const accessToken = await getAccessToken();

    // Imagen uses :predict, not :generateContent
    const endpoint = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL}:predict`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        instances: [
          {
            prompt: prompt,
          },
        ],
        parameters: {
          sampleCount: 1,
          aspectRatio: '1:1',
          outputMimeType: 'image/jpeg',
        },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Imagen 4 error ${response.status}: ${errBody}`);
    }

    const data = await response.json();

    // Imagen returns base64 in predictions[].bytesBase64Encoded
    const imageData = data.predictions?.[0]?.bytesBase64Encoded;
    if (!imageData) throw new Error('No image data returned from Imagen 4. Full response: ' + JSON.stringify(data));

    console.log('[Imagen4] Image generated successfully for prompt:', prompt.substring(0, 80));
    return imageData;
  } catch (err: any) {
    if (attempt < 3) {
      console.warn(`Imagen 4 attempt ${attempt} failed, retrying...`, err.message);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
      return imagen4Generate(prompt, attempt + 1);
    }
    console.error('Imagen 4 image gen failed after 3 attempts:', err.message);
    throw err;
  }
}

export async function generateProductShots(
  imageUrl: string,
  scenes: any[],
  theme: string
): Promise<string[]> {
  if (!PROJECT_ID) throw new Error('Missing GOOGLE_CLOUD_PROJECT_ID in .env');

  const results: string[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];

    // Build a rich, detailed prompt for Imagen 4
    const prompt = [
      `Premium product advertisement photograph.`,
      `Scene: ${scene.visualPrompt}`,
      `Theme: ${theme}.`,
      `Style: Ultra-realistic, 4K, studio lighting, cinematic, commercial quality, clean background.`,
    ].join(' ');

    console.log(`[Imagen4] Generating shot ${i + 1}/${scenes.length}`);
    const imageData = await imagen4Generate(prompt);

    const shotUrl = await uploadBase64ToCloudinary(
      imageData,
      `shot-${Date.now()}-${i}.jpg`
    );
    results.push(shotUrl);
  }

  return results;
}
