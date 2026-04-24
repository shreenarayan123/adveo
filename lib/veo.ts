import { GoogleAuth } from 'google-auth-library';
import * as path from 'path';
import { uploadBase64ToCloudinary } from './storage';
import { concatenateClips } from './ffmpeg';
import type { ProductImageAnalysis } from './ai';

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID!;
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const VEO_MODEL = 'veo-3.1-generate-001';
const CLIP_DURATION_SECONDS = 6;       // 3 clips × 6s = 18s total (Veo supported: 4, 6, 8)
const FINAL_DURATION_SECONDS = 18;
const DEFAULT_RESOLUTION = process.env.VEO_RESOLUTION;
const DEFAULT_GENERATE_AUDIO = true;   // Veo generates scene-matched ambient audio — used as BGM under ElevenLabs narration
const DEFAULT_STORAGE_URI = process.env.VEO_STORAGE_URI;
const CREDENTIALS_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS
  ? path.resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS)
  : undefined;

const POLICY_SENSITIVE_TERMS = [
  'awaken',
  'senses',
  'intensity',
  'passion',
  'desire',
  'embrace',
  'intimate',
  'seductive',
  'sensual',
  'provocative',
  'alluring',
];

// Color directives appended to every Veo prompt — combats Veo's desaturation tendency
const COLOR_ENFORCEMENT = 'Full color. Rich vibrant color grade. No desaturation. No black and white. No monochrome.';
const AUDIO_ENFORCEMENT = 'Generate cinematic background audio — ambient sound and music only. NO human voice, NO narration, NO spoken words, NO singing.';
const POST_ENFORCEMENT  = 'NO voiceover. NO text overlays. NO on-screen captions. Pure cinematic visuals and ambient audio.';
const QUALITY_ENFORCEMENT = 'Cinematic, commercial-grade, 4K, smooth intentional camera movement.';

// Atmosphere enforcement — prevents Veo from adding smoke, fog, haze, mist effects
// that it frequently inserts in moody indoor/luxury scenes without being asked.
const ATMOSPHERE_ENFORCEMENT = 'NO smoke effects. NO fog. NO atmospheric haze. NO mist. NO volumetric smoke trails. NO magical particle effects. NO supernatural atmospheric phenomena. Clean cinematic air only.';

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

function parseGsUri(uri: string): { bucket: string; objectPath: string } {
  const match = uri.match(/^gs:\/\/([^\/]+)\/(.+)$/);
  if (!match) {
    throw new Error(`Invalid GCS URI: ${uri}`);
  }

  return {
    bucket: match[1],
    objectPath: match[2],
  };
}

async function gcsUriToBase64(gcsUri: string, accessToken: string): Promise<string> {
  const { bucket, objectPath } = parseGsUri(gcsUri);
  const encodedPath = encodeURIComponent(objectPath);
  const downloadUrl = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodedPath}?alt=media`;

  const response = await fetch(downloadUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to read GCS output ${gcsUri}: ${response.status} ${body}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer.toString('base64');
}

interface VeoGenerationOptions {
  durationSeconds: number;
  accessToken: string;
  resolution?: string;
  storageUri?: string;
  sampleCount?: number;
  generateAudio?: boolean;
}

interface OverlayTextSpec {
  text: string;
  position: 'top' | 'bottom';
  fontSize?: number;
  color?: string;
  yOffset?: number;
}

interface GenerateVideoOptions {
  productName?: string;
  cta?: string;
  category?: string;
  durationSeconds?: number;
  styleHint?: string;
  imageAnalysis?: ProductImageAnalysis;
}

function sanitizePromptText(input: string): string {
  let sanitized = input;

  for (const term of POLICY_SENSITIVE_TERMS) {
    const re = new RegExp(`\\b${term}\\b`, 'gi');
    sanitized = sanitized.replace(re, 'elegance');
  }

  return sanitized.replace(/\s+/g, ' ').trim();
}

function flattenVisualPrompt(visualPrompt: unknown, description?: string, fallback = ''): string {
  if (typeof visualPrompt === 'string') {
    return visualPrompt;
  }

  if (visualPrompt && typeof visualPrompt === 'object') {
    const prompt = visualPrompt as {
      subject?: string;
      action?: string;
      cameraAngle?: string;
      lighting?: string;
      colorGrade?: string;
      doNotInclude?: string;
    };

    return [
      prompt.subject,
      prompt.action,
      prompt.cameraAngle,
      prompt.lighting,
      prompt.colorGrade,
      prompt.doNotInclude ? `AVOID: ${prompt.doNotInclude}` : null,
    ]
      .filter(Boolean)
      .join('. ');
  }

  return description || fallback;
}

/**
 * Builds the product visual reference block injected into every Veo prompt.
 * This is how the product's real appearance (extracted by GPT-4o Vision) gets
 * into the video generation prompts WITHOUT passing the image directly to Veo.
 *
 * Key rule from user: Veo should generate ad clips FEATURING the product —
 * NOT animate the product photo as the first frame. The product must appear
 * naturally in the scene with exactly the same color/design/packaging.
 */
function buildProductVisualContext(imageAnalysis?: ProductImageAnalysis): string {
  if (!imageAnalysis) return '';

  return [
    `PRODUCT TO FEATURE: ${imageAnalysis.whatItIs}.`,
    `Exact appearance: ${imageAnalysis.visualDescriptor}.`,
    `Product colors: ${imageAnalysis.primaryColor} (primary), ${imageAnalysis.keyColors.join(', ')}.`,
    `Packaging: ${imageAnalysis.packaging}.`,
    `CRITICAL: The product appearing in this clip must visually match these specs exactly — same colors, same packaging, same design. Do NOT substitute a generic or different product.`,
  ].join(' ');
}

function buildVisualPromptBlock(scene: any, fallback = ''): string {
  const vp = scene?.visualPrompt;
  if (!vp || typeof vp !== 'object') {
    return sanitizePromptText(scene?.description || fallback);
  }

  const lines: string[] = [];
  if (vp.subject)       lines.push(`Subject: ${vp.subject}`);
  if (vp.action)        lines.push(`Action: ${vp.action}`);
  if (vp.cameraAngle)   lines.push(`Camera: ${vp.cameraAngle}`);
  if (vp.lighting)      lines.push(`Lighting: ${vp.lighting}`);
  if (vp.colorGrade)    lines.push(`Color grade: ${vp.colorGrade}`);
  if (vp.doNotInclude)  lines.push(`Avoid: ${vp.doNotInclude}`);

  return sanitizePromptText(lines.join('. '));
}

/**
 * Sanitizes action descriptions that involve physical sensations (smell, taste, touch).
 * Veo misinterprets vague body-language like "inhales deeply" as mouth contact.
 * This rewrites those actions with anatomically precise language so Veo renders
 * the correct body mechanics — e.g. nose to wrist, mouth closed, for sniffing.
 */
function sanitizePhysicalAction(action: string): string {
  if (!action) return action;

  let sanitized = action;

  // Sniffing / smelling perfume — must be nose-only, no mouth contact
  if (/\b(inhales?|sniffs?|smells?|breathes? in)\b/i.test(sanitized)) {
    sanitized = sanitized
      // Replace vague "inhales deeply" with an anatomically precise alternative
      .replace(/(inhales? deeply)/gi, 'presses wrist gently to nose and draws a slow nasal breath, mouth fully closed, eyes softly closing')
      .replace(/(inhales?)/gi, 'takes a slow nasal inhale, nose close to wrist, mouth firmly closed')
      .replace(/(sniffs?)/gi, 'holds wrist under nose, mouth closed, draws a deliberate nasal breath')
      .replace(/(smells?)/gi, 'raises wrist to nose, mouth closed, slow nasal inhale');

    // Ensure no mouth-related words slip through that Veo might interpret as kiss/lick
    sanitized += '. CRITICAL: character uses nose only — mouth is closed and does NOT touch the wrist or product.';
  }

  // Tasting / drinking — specify clean sip, no licking
  if (/\b(tastes?|sips?|drinks?|licks?)\b/i.test(sanitized)) {
    sanitized = sanitized
      .replace(/(licks?)/gi, 'gently sips from the rim')
      .replace(/(tastes?)/gi, 'carefully sips');
    sanitized += '. Clean contact only — no exaggerated mouth movements.';
  }

  return sanitized;
}

function buildHeroPrompt(
  scenes: any[],
  options: Pick<GenerateVideoOptions, 'productName' | 'category' | 'styleHint' | 'imageAnalysis'>
): string {
  const scene = scenes?.[0] || {};
  const productName = sanitizePromptText(options.productName || 'Product');
  const emotionBeat = sanitizePromptText(scene.emotionBeat || '');
  const description = sanitizePromptText(scene.description || '');

  // Sanitize the action field for physical sensation accuracy before building the block
  if (scene?.visualPrompt?.action) {
    scene.visualPrompt.action = sanitizePhysicalAction(scene.visualPrompt.action);
  }

  const visualBlock = buildVisualPromptBlock(scene, options.styleHint || 'Cinematic product opening shot');
  const productContext = buildProductVisualContext(options.imageAnalysis);

  return [
    `Cinematic ad — OPENING SHOT. Product: ${productName}.`,
    productContext,
    description ? `Scene: ${description}.` : '',
    visualBlock,
    emotionBeat ? `Emotional intent: ${emotionBeat}.` : '',
    COLOR_ENFORCEMENT,
    ATMOSPHERE_ENFORCEMENT,
    AUDIO_ENFORCEMENT,
    POST_ENFORCEMENT,
    'Maintain same visual style throughout. Cinematic, commercial-grade, 4K, smooth intentional camera movement.',
  ].filter(Boolean).join(' ');
}

function buildScenePrompt(
  scene: any,
  options: Pick<GenerateVideoOptions, 'productName' | 'category' | 'imageAnalysis'>,
  sceneIndex: number   // 1 = middle, 2 = closing
): string {
  const productName = sanitizePromptText(options.productName || 'Product');
  const emotionBeat = sanitizePromptText(scene?.emotionBeat || '');
  const description = sanitizePromptText(scene?.description || '');

  // Sanitize the action field for physical sensation accuracy before building the block
  if (scene?.visualPrompt?.action) {
    scene.visualPrompt.action = sanitizePhysicalAction(scene.visualPrompt.action);
  }

  const visualBlock = buildVisualPromptBlock(scene, 'Cinematic product ad shot');
  const productContext = buildProductVisualContext(options.imageAnalysis);

  const positionHint =
    sceneIndex === 1
      ? 'MIDDLE SHOT — continue and escalate the narrative. The product is the turning point. Same visual style as the opening shot.'
      : 'CLOSING SHOT — emotional payoff and resolution. Show the human impact, not just the product. Resolve what was set up. No new visual elements.';

  return [
    `Cinematic ad shot. Product: ${productName}.`,
    positionHint,
    productContext,
    description ? `Scene: ${description}.` : '',
    visualBlock,
    emotionBeat ? `Emotional intent: ${emotionBeat}.` : '',
    COLOR_ENFORCEMENT,
    ATMOSPHERE_ENFORCEMENT,
    AUDIO_ENFORCEMENT,
    POST_ENFORCEMENT,
    'Maintain the same color grade, lighting, and camera style as the opening shot.',
    QUALITY_ENFORCEMENT,
  ].filter(Boolean).join(' ');
}

export function addTextOverlaysToVideoUrl(videoUrl: string, overlays: OverlayTextSpec[]): string {
  if (!videoUrl.includes('/upload/')) {
    return videoUrl;
  }

  const overlaySegments = overlays
    .filter((o) => o.text?.trim())
    .map((overlay) => {
      const text = encodeURIComponent(overlay.text.trim());
      const fontSize = overlay.fontSize ?? 54;
      const color = overlay.color ?? 'ffffff';
      const gravity = overlay.position === 'top' ? 'north' : 'south';
      const y = overlay.yOffset ?? 90;
      return `l_text:Arial_${fontSize}_bold:${text},co_rgb:${color},g_${gravity},y_${y},fl_layer_apply`;
    });

  if (overlaySegments.length === 0) {
    return videoUrl;
  }

  return videoUrl.replace('/upload/', `/upload/${overlaySegments.join('/')}/`);
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
    generateAudio,
    durationSeconds: CLIP_DURATION_SECONDS,
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
  const endpoint = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${VEO_MODEL}:fetchPredictOperation`;
  const startedAt = Date.now();

  while (Date.now() - startedAt < maxWaitMs) {
    await new Promise((r) => setTimeout(r, 10_000));

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ operationName }),
    });

    const text = await response.text();

    if (!response.ok) {
      console.error('[Veo3.1] Poll error:', response.status, text);
      continue;
    }

    const data = JSON.parse(text);
    console.log('[Veo3.1] done:', data.done);

    if (!data.done) {
      continue;
    }

    if (data.error) throw new Error(JSON.stringify(data.error));

    const videoBase64 = data.response?.videos?.[0]?.bytesBase64Encoded;
    if (videoBase64) {
      return videoBase64;
    }

    const gcsUri = data.response?.videos?.[0]?.gcsUri;
    if (gcsUri) {
      console.log('[Veo3.1] Output returned as GCS object, downloading:', gcsUri);
      return gcsUriToBase64(gcsUri, accessToken);
    }

    throw new Error('Veo completed but no video data found: ' + JSON.stringify(data.response));
  }

  throw new Error(`Veo operation timed out after ${maxWaitMs / 1000}s`);
}

/**
 * Returns true for transient Vertex AI errors that are safe to retry.
 * gRPC code 14 = UNAVAILABLE, code 8 = RESOURCE_EXHAUSTED, code 10 = ABORTED
 */
function isRetryableVeoError(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? err);
  if (/\"code\"\s*:\s*(8|10|14)/.test(msg)) return true;
  if (/unavailable|resource.exhausted|try again/i.test(msg)) return true;
  if (/503|429/.test(msg)) return true;
  return false;
}

/**
 * Generate a single video clip using Veo 3.1 — pure text-to-video, no image input.
 * The product image is NOT passed to Veo directly. Instead, its visual description
 * (extracted by GPT-4o Vision in analyzeProductImage) is injected into the text prompt.
 * This ensures Veo generates ad footage FEATURING the product (correct colors/design),
 * NOT animating the exact photo as a first frame.
 * Retries up to 3 times on transient Vertex AI service errors.
 */
async function generateHeroVideo(
  prompt: string,
  durationSeconds: number
): Promise<string> {
  const MAX_ATTEMPTS = 3;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const accessToken = await getAccessToken();
      const operationName = await startVeoGeneration(prompt, null, {
        durationSeconds,
        accessToken,
      });
      const videoBase64 = await pollVeoOperation(operationName, accessToken);
      const clipUrl = await uploadBase64ToCloudinary(videoBase64, `clip-${Date.now()}.mp4`);
      console.log('[Veo3.1] Scene clip uploaded:', clipUrl);
      return clipUrl;
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_ATTEMPTS && isRetryableVeoError(err)) {
        const waitMs = attempt * 15_000; // 15s → 30s
        console.warn(`[Veo3.1] Transient error (attempt ${attempt}/${MAX_ATTEMPTS}), retrying in ${waitMs / 1000}s:`, (err as Error).message);
        await new Promise((r) => setTimeout(r, waitMs));
      } else {
        throw err;
      }
    }
  }

  throw lastErr;
}

/**
 * Generate all 3 video clips using Veo 3.1 and concatenate into an 18s ad.
 *
 * Image handling: The product imageUrl is NOT passed to Veo as image-to-video.
 * Instead, the product's visual identity (from imageAnalysis) is injected into
 * text prompts so Veo generates cinematic ad footage that faithfully features
 * the real product — same colors, same packaging — as part of the story.
 */
export async function generateVideo(
  imageUrl: string | null,
  scenes: any[],
  options: GenerateVideoOptions = {}
): Promise<string> {
  if (!PROJECT_ID) throw new Error('Missing GOOGLE_CLOUD_PROJECT_ID in .env');

  // Always exactly 3 scenes
  const normalizedScenes = [
    scenes?.[0] || {},
    scenes?.[1] || scenes?.[0] || {},
    scenes?.[2] || scenes?.[0] || {},
  ];

  const productName = options.productName || 'Product';
  const category = options.category || 'product';
  const imageAnalysis = options.imageAnalysis;
  const promptContext = { productName, category, imageAnalysis };

  const clipUrls: string[] = [];

  for (let i = 0; i < normalizedScenes.length; i++) {
    const scene = normalizedScenes[i];

    let prompt: string;

    if (i === 0) {
      prompt = buildHeroPrompt([scene], {
        ...promptContext,
        styleHint: options.styleHint || flattenVisualPrompt(scene?.visualPrompt, scene?.description),
      });
    } else {
      prompt = buildScenePrompt(scene, promptContext, i);
    }

    console.log(`[Video] Generating clip ${i + 1}/3 (${CLIP_DURATION_SECONDS}s) — text-to-video with product context`);
    console.log(`[Video] Clip ${i + 1} prompt preview:`, prompt.substring(0, 200) + '...');

    // Pure text-to-video for all clips — product image context is in the prompt text
    const clipUrl = await generateHeroVideo(prompt, CLIP_DURATION_SECONDS);
    clipUrls.push(clipUrl);
    console.log(`[Video] Clip ${i + 1} URL:`, clipUrl);
  }

  console.log('[Video] All 3 clips generated. Concatenating into 18s final video...');
  console.log('[Video] Clip URLs:', clipUrls);
  const finalVideoUrl = await concatenateClips(clipUrls, FINAL_DURATION_SECONDS);
  console.log('[Video] Final concatenated video:', finalVideoUrl);
  return finalVideoUrl;
}
