import { GoogleAuth } from 'google-auth-library';
import * as path from 'path';
import { uploadBase64ToCloudinary } from './storage';

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID!;
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const VEO_MODEL = 'veo-3.1-generate-001';
const DEFAULT_RESOLUTION = process.env.VEO_RESOLUTION;
const DEFAULT_GENERATE_AUDIO = process.env.VEO_GENERATE_AUDIO === 'true';
const DEFAULT_STORAGE_URI = process.env.VEO_STORAGE_URI;
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
  const client = await getAuthClient().getClient();
  const tokenResponse = await client.getAccessToken();
  if (!tokenResponse.token) throw new Error('Failed to get Vertex AI access token');
  return tokenResponse.token;
}

async function urlToBase64WithMimeType(url: string): Promise<{ base64: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${url}`);
  const buffer = await res.arrayBuffer();
  const mimeType = res.headers.get('content-type') || 'image/jpeg';
  return { base64: Buffer.from(buffer).toString('base64'), mimeType };
}

interface VeoGenerationOptions {
  durationSeconds: number;
  accessToken: string;
  resolution?: string;
  storageUri?: string;
  sampleCount?: number;
  generateAudio?: boolean;
}

/**
 * Start a Veo 3.1 video generation operation (returns operation name for polling)
 */
async function startVeoGeneration(
  prompt: string,
  image: { base64: string; mimeType: string } | null,
  options: VeoGenerationOptions
): Promise<string> {
  const endpoint = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${VEO_MODEL}:predictLongRunning`;
  const { durationSeconds, accessToken, resolution, storageUri, sampleCount = 1, generateAudio = DEFAULT_GENERATE_AUDIO } = options;

  const instance: Record<string, any> = { prompt };
  if (image) {
    // Image-to-Video: animate the product shot
    instance.image = {
      bytesBase64Encoded: image.base64,
      mimeType: image.mimeType,
    };
  }

  const parameters: Record<string, any> = {
    sampleCount,
    durationSeconds: Math.min(Math.max(durationSeconds, 5), 8), // Veo min 5s, max 8s per clip
    generateAudio,
  };

  if (resolution || DEFAULT_RESOLUTION) {
    parameters.resolution = resolution || DEFAULT_RESOLUTION;
  }

  if (storageUri || DEFAULT_STORAGE_URI) {
    parameters.storageUri = storageUri || DEFAULT_STORAGE_URI;
  }

  const body = {
    instances: [instance],
    parameters,
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Veo 3.1 start failed ${response.status}: ${errBody}`);
  }

  const data = await response.json();
  if (!data.name) throw new Error('Veo operation returned no name: ' + JSON.stringify(data));
  console.log('[Veo3.1] Operation started:', data.name);
  return data.name; // e.g. "projects/.../operations/..."
}

/**
 * Poll the LRO until done, returns the base64 video bytes
 */
async function pollVeoOperation(
  operationName: string,
  accessToken: string,
  maxWaitMs = 5 * 60 * 1000  // 5 minutes timeout
): Promise<string> {
  const pollUrl = `https://${LOCATION}-aiplatform.googleapis.com/v1/${operationName}`;
  const start = Date.now();
  const intervalMs = 10_000; // poll every 10 seconds

  while (Date.now() - start < maxWaitMs) {
    await new Promise((r) => setTimeout(r, intervalMs));

    const res = await fetch(pollUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      console.warn('[Veo3.1] Poll error:', res.status);
      continue;
    }

    const data = await res.json();
    console.log('[Veo3.1] Poll status — done:', data.done);

    if (data.done) {
      if (data.error) throw new Error('Veo operation failed: ' + JSON.stringify(data.error));

      // Try base64 inline first
      const videoBase64 = data.response?.videos?.[0]?.bytesBase64Encoded;
      if (videoBase64) return videoBase64;

      // If GCS URI, we need to read from GCS (not implemented here)
      const gcsUri = data.response?.videos?.[0]?.gcsUri;
      if (gcsUri) throw new Error('Video saved to GCS URI — configure Cloudinary GCS integration: ' + gcsUri);

      throw new Error('Veo completed but no video data found: ' + JSON.stringify(data.response));
    }
  }

  throw new Error(`Veo operation timed out after ${maxWaitMs / 1000}s`);
}

/**
 * Generate a video clip for a single scene using Veo 3.1
 * Uses Image-to-Video if an imageUrl is provided, otherwise Text-to-Video
 */
async function generateSceneVideo(
  prompt: string,
  imageUrl: string | null,
  durationSeconds: number
): Promise<string> {
  const accessToken = await getAccessToken();

  let image: { base64: string; mimeType: string } | null = null;
  if (imageUrl) {
    try {
      image = await urlToBase64WithMimeType(imageUrl);
    } catch (e) {
      console.warn('[Veo3.1] Could not load image, falling back to text-to-video:', e);
    }
  }

  const operationName = await startVeoGeneration(prompt, image, {
    durationSeconds,
    accessToken,
  });
  const videoBase64 = await pollVeoOperation(operationName, accessToken);

  // Upload clip to Cloudinary
  const clipUrl = await uploadBase64ToCloudinary(videoBase64, `clip-${Date.now()}.mp4`);
  console.log('[Veo3.1] Scene clip uploaded:', clipUrl);
  return clipUrl;
}

/**
 * Generate all scene video clips using Veo 3.1
 * @param shotUrls - Imagen-generated product shot URLs (one per scene)
 * @param scenes - Scene array from the script (with duration, visualPrompt, description)
 * @returns Array of Cloudinary video clip URLs
 */
export async function generateVideo(shotUrls: string[], scenes: any[]): Promise<string> {
  if (!PROJECT_ID) throw new Error('Missing GOOGLE_CLOUD_PROJECT_ID in .env');

  // Import here to avoid circular deps
  const { concatenateClips } = await import('./ffmpeg');

  const clipUrls: string[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const imageUrl = shotUrls[i] || null;
    const duration = scene.duration || 5;
    const prompt = `${scene.visualPrompt}. ${scene.description}. Cinematic, 4K, smooth camera movement, professional product advertisement.`;

    console.log(`[Veo3.1] Generating clip ${i + 1}/${scenes.length} (${duration}s)`);

    let clipUrl: string;
    try {
      clipUrl = await generateSceneVideo(prompt, imageUrl, duration);
    } catch (err: any) {
      console.error(`[Veo3.1] Clip ${i + 1} failed, retrying once:`, err.message);
      // One retry with text-only if image-to-video fails
      clipUrl = await generateSceneVideo(prompt, null, duration);
    }

    clipUrls.push(clipUrl);
  }

  // Concatenate all scene clips into one video
  const finalVideoUrl = await concatenateClips(clipUrls);
  return finalVideoUrl;
}
