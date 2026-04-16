import { z } from 'zod';
import { openai } from './openai';


export const SceneSchema = z.object({
  duration: z.number(),
  description: z.string(),
  visualPrompt: z.string(),
  narration: z.string(),
});

export const VoiceTypeSchema = z.object({
  gender: z.enum(['male', 'female']).catch('female'),
  tone: z.enum(['energetic', 'calm', 'authoritative']).catch('calm'),
  pace: z.enum(['fast', 'medium', 'slow']).catch('medium'),
});

export const ScriptV2Schema = z.object({
  hook: z.string(),
  scenes: z.array(SceneSchema),
  tagline: z.string(),
  voiceType: VoiceTypeSchema,
  musicMood: z.enum(['upbeat', 'dramatic', 'calm']).catch('upbeat'),
});

export const ScriptSchema = z.object({
  scenes: z.array(SceneSchema),
});


export type ScriptV2 = z.infer<typeof ScriptV2Schema>;

export async function generateIdeationPrompt(theme: string, productDescription: string) {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You are an expert creative director.' },
      { role: 'user', content: `Generate a short ideation prompt for a ${theme} themed video ad for the product: ${productDescription}. Return JSON with an "idea" field.` }
    ],
    response_format: { type: 'json_object' }
  });
  const res = completion.choices[0]?.message?.content || '{"idea": "A creative ad"}';
  return JSON.parse(res) as { idea: string };
}

export async function generateScriptPrompt(ideation: { idea: string }) {
  const exampleJson = JSON.stringify({
    hook: "Opening hook line",
    scenes: [
      { duration: 4, description: "Wide establishing shot", visualPrompt: "Product on golden surface with dramatic lighting", narration: "Short punchy line." },
      { duration: 5, description: "Close-up feature shot", visualPrompt: "Extreme close-up of product texture", narration: "Another short line." },
      { duration: 5, description: "Lifestyle context shot", visualPrompt: "Product in lifestyle setting", narration: "Final emotional line." }
    ],
    tagline: "Memorable closing tagline",
    voiceType: { gender: "female", tone: "calm", pace: "medium" },
    musicMood: "upbeat"
  });

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You are an expert video script writer. Return exact JSON. Scene durations MUST sum to 12-20 seconds. Keep narration SHORT to fit within each scene duration.' },
      { role: 'user', content: `Write a 3-4 scene product ad script (12-20 seconds total) based on this idea: ${ideation.idea}. Return JSON matching this format exactly:\n${exampleJson}` }
    ],
    response_format: { type: 'json_object' }
  });
  
  const res = completion.choices[0]?.message?.content || '{}';
  return ScriptV2Schema.parse(JSON.parse(res));
}

// --- COMPETITIVE INTELLIGENCE SCRIPT GENERATION ---
import { prisma } from './prisma';

export async function generateScript(
  productName: string,
  theme: string,
  category: string,
  targetAudience: string,
  patterns: any
): Promise<ScriptV2> {
  const systemPrompt = `You are a senior creative director for product ads.

PROVEN WINNING PATTERNS FOR ${category} - ${theme}:
${JSON.stringify(patterns, null, 2)}

Create a 12-20 second product ad script with 3-4 scenes. Each scene MUST have a "duration" field in seconds. All scene durations must sum to 12-20 seconds. Keep narration SHORT to fit each scene duration.`;

  const exampleJson = JSON.stringify({
    hook: "Opening line using proven pattern",
    scenes: [
      { duration: 4, description: "Scene description with camera angle", visualPrompt: "Detailed prompt for image/video generation", narration: "Short voiceover line" },
      { duration: 5, description: "Scene description with camera angle", visualPrompt: "Detailed prompt for image/video generation", narration: "Short voiceover line" },
      { duration: 5, description: "Scene description with camera angle", visualPrompt: "Detailed prompt for image/video generation", narration: "Short voiceover line" }
    ],
    tagline: "Memorable closing line",
    voiceType: { gender: "male", tone: "energetic", pace: "medium" },
    musicMood: "upbeat"
  });

  const userPrompt = `Product: ${productName}\nTheme: ${theme}\nTarget: ${targetAudience}\n\nGenerate ad script in this EXACT JSON format:\n${exampleJson}`;

  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
      });
      const raw = res.choices[0]?.message?.content || '';
      const parsed = JSON.parse(raw);
      return ScriptV2Schema.parse(parsed);
    } catch (err: any) {
      lastErr = err;
      console.error('Script gen error (attempt', attempt, '):', err);
      await new Promise(r => setTimeout(r, 500 * attempt));
    }
  }
  throw new Error('Failed to generate script: ' + (lastErr?.message || lastErr));
}
