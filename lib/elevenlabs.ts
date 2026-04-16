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
