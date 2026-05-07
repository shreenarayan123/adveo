import { uploadBufferToCloudinary } from './storage';

const DEFAULT_VOICE_ID = 'ThT5KcBeYPX3keUQqHPh'; // Dorothy — calm female

async function elevenLabsGenerate(
  script: string,
  voiceId: string,
  apiKey: string,
  attempt = 1
): Promise<Buffer> {
  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: script,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.3,
          },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`ElevenLabs API error ${response.status}: ${errText}`);
    }

    const audioBuffer = await response.arrayBuffer();
    console.log('[ElevenLabs] Generated audio, size:', audioBuffer.byteLength, 'bytes, voiceId:', voiceId);
    return Buffer.from(audioBuffer);
  } catch (err) {
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 500 * attempt));
      return elevenLabsGenerate(script, voiceId, apiKey, attempt + 1);
    }
    console.error('ElevenLabs voice gen failed:', err);
    throw err;
  }
}

/**
 * Generate voiceover audio and upload to Cloudinary.
 * @param script - The narration text
 * @param voiceId - Direct ElevenLabs voice ID (from project.voiceId)
 */
export async function generateVoice(script: string, voiceId?: string | null): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('Missing ELEVENLABS_API_KEY');

  const resolvedVoiceId = voiceId || DEFAULT_VOICE_ID;
  const audioBuffer = await elevenLabsGenerate(script, resolvedVoiceId, apiKey);

  const audioUrl = await uploadBufferToCloudinary(audioBuffer, `audio-${Date.now()}.mp3`, 'audio/mpeg');
  return audioUrl;
}

/**
 * Mood → ElevenLabs sound-generation prompt mapping.
 * Each prompt is tuned to produce 18 seconds of loopable background music
 * that fits the ad theme without overwhelming the narration.
 */
const BGM_MOOD_PROMPTS: Record<string, string> = {
  upbeat:    'Upbeat, energetic background music for a product advertisement. Fast tempo, positive mood, electronic beats with bright melody. No vocals. Seamless, clean mix.',
  calm:      'Calm, soothing background music for a product advertisement. Gentle piano with soft ambient pads. Slow tempo, peaceful, relaxing. No vocals.',
  luxury:    'Luxury cinematic background music for a premium product advertisement. Elegant orchestral strings, slow and majestic. Rich, polished sound. No vocals.',
  energy:    'High-energy electronic background music for a sports product advertisement. Driving beat, powerful synths, dynamic crescendo. No vocals. Pump-up mood.',
  nature:    'Organic, natural background music for an eco-friendly product advertisement. Acoustic guitar, gentle breeze sounds, birds, warm tone. No vocals.',
  minimal:   'Minimalist, clean background music for a modern product advertisement. Sparse electronic tones, subtle rhythm, sophisticated atmosphere. No vocals.',
  studio:    'Professional, polished background music for a studio product advertisement. Clean electronic melody, confident beat, modern commercial feel. No vocals.',
  lifestyle: 'Lifestyle background music for a product advertisement. Warm acoustic guitar, feel-good indie pop beat, optimistic mood. No vocals.',
  default:   'Background music for a product advertisement. Pleasant, professional, upbeat. Moderate tempo. No vocals.',
};

/**
 * Generate an 18-second background music track using ElevenLabs sound-generation API.
 * The track is mood-matched to the ad theme and uploaded to Cloudinary.
 *
 * @param musicMood - The mood/theme string (e.g. 'upbeat', 'luxury', 'calm')
 * @returns Cloudinary URL of the generated BGM MP3
 */
export async function generateBGM(musicMood?: string): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('Missing ELEVENLABS_API_KEY');

  const mood = (musicMood || 'default').toLowerCase();
  const prompt = BGM_MOOD_PROMPTS[mood] || BGM_MOOD_PROMPTS['default'];

  console.log(`[ElevenLabs BGM] Generating 18s BGM — mood: "${mood}"`);
  console.log(`[ElevenLabs BGM] Prompt: ${prompt}`);

  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(
        'https://api.elevenlabs.io/v1/sound-generation',
        {
          method: 'POST',
          headers: {
            'Accept': 'audio/mpeg',
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: prompt,
            duration_seconds: 18,
            prompt_influence: 0.3,
          }),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`ElevenLabs sound-generation error ${response.status}: ${errText}`);
      }

      const audioBuffer = await response.arrayBuffer();
      console.log('[ElevenLabs BGM] Generated BGM, size:', audioBuffer.byteLength, 'bytes');

      const bgmUrl = await uploadBufferToCloudinary(
        Buffer.from(audioBuffer),
        `bgm-${Date.now()}.mp3`,
        'audio/mpeg'
      );
      console.log('[ElevenLabs BGM] BGM uploaded:', bgmUrl);
      return bgmUrl;
    } catch (err) {
      lastErr = err;
      if (attempt < 3) {
        console.warn(`[ElevenLabs BGM] Attempt ${attempt} failed, retrying in ${attempt * 2}s:`, (err as Error).message);
        await new Promise((r) => setTimeout(r, attempt * 2000));
      }
    }
  }

  throw lastErr;
}
