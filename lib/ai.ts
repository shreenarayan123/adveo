import { z } from 'zod';
import { openai } from './openai';
import { prisma } from './prisma';

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const VisualPromptSchema = z.object({
  subject: z.string(),          // who/what is in frame
  action: z.string(),           // what's happening
  cameraAngle: z.string(),      // e.g. "extreme low angle, 24mm"
  lighting: z.string(),         // e.g. "harsh midday sun, deep shadows"
  colorGrade: z.string(),       // e.g. "warm golden tones, rich saturation"
  doNotInclude: z.string(),     // explicit exclusions for video gen
});

export const SceneSchema = z.object({
  sceneNumber: z.number(),
  durationSeconds: z.literal(6),      // FIXED: every scene is exactly 6 seconds (Veo supported: 4, 6, 8)
  description: z.string(),
  visualPrompt: VisualPromptSchema,
  narration: z.string().nullable(),   // null for scenes that should be silent
  onScreenText: z.string().nullable(), // null unless text overlay is needed
  isCTAScene: z.boolean(),            // ONLY true for scene 3
  emotionBeat: z.string(),            // what viewer feels in this moment
});

export const VoiceoverScriptSchema = z.object({
  fullScript: z.string(),             // complete VO as one continuous piece
  voiceTone: z.string(),              // single tone applied to entire ad
  sceneAssignments: z.record(         // "scene_1": "line..." | null
    z.string(),
    z.string().nullable()
  ),
});

export const VoiceTypeSchema = z.object({
  gender: z.enum(['male', 'female']).catch('female'),
  tone: z.enum(['energetic', 'calm', 'authoritative']).catch('calm'),
  pace: z.enum(['fast', 'medium', 'slow']).catch('medium'),
});

export const AdConceptSchema = z.object({
  hook: z.string(),
  emotion: z.string(),
  narrativeArc: z.string(),
  cta: z.string(),                    // appears in output ONCE, in last scene only
  visualStyle: z.object({
    camera: z.string(),
    colorGrade: z.string(),
    editingRhythm: z.string(),
    doNotInclude: z.string(),
  }),
  scenes: z.array(SceneSchema).length(3), // FIXED: exactly 3 scenes, no more, no less
  voiceoverScript: VoiceoverScriptSchema,
  voiceType: VoiceTypeSchema,
  musicMood: z.enum(['upbeat', 'dramatic', 'calm', 'tense', 'nostalgic']).catch('upbeat'),
  tagline: z.string(),
});

export const WinningPatternSchema = z.object({
  hook_styles: z.array(z.string()).optional(),
  visual_patterns: z.array(z.string()).optional(),
  emotional_triggers: z.array(z.string()).optional(),
  avoid: z.array(z.string()).optional(),
});

export type Scene = z.infer<typeof SceneSchema>;
export type AdConcept = z.infer<typeof AdConceptSchema>;
export type WinningPattern = z.infer<typeof WinningPatternSchema>;

export type IdeationPromptResult = {
  idea: string;
};

// ─── Narrative Style: Two Ad Arc Types ────────────────────────────────────────

/**
 * UGC Arc  — benefit is visible/demonstrable on camera (skincare, perfume, supplements).
 *            Structure: human problem → product solving it → emotional result.
 *
 * Craft Arc — benefit is felt/sensory, not demonstrable by reaction alone (shoes, food, drinks).
 *            Structure: raw material / origin → the making / craft → product in the world.
 */
export type NarrativeStyle = 'ugc' | 'craft';

/**
 * Auto-classifies a product into ugc or craft narrative arc.
 * Uses keyword scoring: craft wins ties (safer default for ambiguous products).
 */
export function detectNarrativeStyle(
  productDescription: string,
  features: string = '',
  productCategory?: string,
): NarrativeStyle {
  const haystack = `${productDescription} ${features} ${productCategory ?? ''}`.toLowerCase();

  // Products whose value is in craftsmanship, origin, texture, or sensory experience
  const craftKeywords = [
    'shoe', 'sneaker', 'boot', 'sandal', 'footwear', 'trainer', 'loafer',
    'oat', 'cereal', 'grain', 'granola', 'bread', 'snack', 'bar', 'food',
    'coffee', 'tea', 'matcha', 'beverage', 'drink', 'juice', 'smoothie', 'latte',
    'chocolate', 'candy', 'sweet', 'dessert', 'pastry', 'cookie', 'biscuit',
    'watch', 'timepiece', 'horology',
    'bag', 'handbag', 'wallet', 'belt', 'luggage', 'purse', 'backpack',
    'whiskey', 'whisky', 'bourbon', 'rum', 'wine', 'beer', 'spirit', 'gin', 'vodka',
    'candle', 'wax', 'soap',
    'jacket', 'denim', 'jeans', 'leather',
  ];

  // Products whose value is demonstrable by visible transformation or sensory reaction
  const ugcKeywords = [
    'serum', 'cream', 'moisturizer', 'lotion', 'sunscreen', 'spf',
    'perfume', 'fragrance', 'cologne', 'eau de',
    'foundation', 'makeup', 'lipstick', 'mascara', 'eyeshadow', 'blush', 'concealer',
    'hair mask', 'shampoo', 'conditioner', 'hair oil',
    'acne', 'skincare', 'anti-aging', 'wrinkle', 'brightening', 'toner',
    'probiotic', 'vitamin', 'supplement', 'protein powder',
    'teeth whitening', 'whitening',
    'weight loss', 'slimming', 'detox',
  ];

  let craftScore = 0;
  let ugcScore = 0;
  for (const kw of craftKeywords) { if (haystack.includes(kw)) craftScore++; }
  for (const kw of ugcKeywords)   { if (haystack.includes(kw)) ugcScore++; }

  // Craft wins ties — safer for unknown products than forcing a UGC problem arc
  return ugcScore > craftScore ? 'ugc' : 'craft';
}

// ─── Product Image Analysis (GPT-4o Vision) ───────────────────────────────────

export interface ProductImageAnalysis {
  whatItIs: string;          // e.g. "a cylindrical tin of oats"
  productCategory: string;   // e.g. "food & nutrition"
  primaryColor: string;      // dominant color of product/packaging
  keyColors: string[];       // all notable colors
  texture: string;           // e.g. "matte, metallic lid"
  packaging: string;         // e.g. "cylindrical tin with kraft-paper label"
  brandElements: string;     // visible logo, text, markings
  visualDescriptor: string;  // dense single-sentence visual fingerprint for Veo prompt injection
}

/**
 * Uses GPT-4o Vision to analyze the uploaded product image.
 * Returns a structured visual description injected into Veo prompts
 * so the model generates clips featuring the ACTUAL product — correct color, shape, packaging.
 * This does NOT pass the image to Veo directly. It extracts context for text prompts.
 */
export async function analyzeProductImage(imageUrl: string): Promise<ProductImageAnalysis> {
  const fallback: ProductImageAnalysis = {
    whatItIs: 'consumer product',
    productCategory: 'product',
    primaryColor: 'neutral',
    keyColors: ['neutral'],
    texture: 'smooth',
    packaging: 'standard packaging',
    brandElements: 'brand logo',
    visualDescriptor: 'consumer product with standard packaging',
  };

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 400,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a visual analyst for ad production.
Describe a product image in structured JSON so a video AI model can recreate the product accurately in generated footage.
Be extremely specific about colors, textures, shapes, and distinguishing features.
Return ONLY valid JSON.`,
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: imageUrl, detail: 'high' },
            },
            {
              type: 'text',
              text: `Analyze this product image and return JSON with exactly these fields:
{
  "whatItIs": "one-line description of what the product is",
  "productCategory": "category (e.g. food, footwear, skincare, electronics)",
  "primaryColor": "the single most dominant color of the product or packaging",
  "keyColors": ["array", "of", "all", "notable", "colors"],
  "texture": "surface texture description",
  "packaging": "packaging shape and material description",
  "brandElements": "any visible brand name, logo, or text on the product",
  "visualDescriptor": "One dense sentence: exact product appearance for a video AI prompt — color + shape + texture + distinguishing marks. E.g.: 'A cylindrical matte black tin with a gold metallic lid and white kraft-paper label printed with red serif typography.'"
}`,
            },
          ],
        },
      ],
    });

    const raw = res.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw);

    return {
      whatItIs: typeof parsed.whatItIs === 'string' ? parsed.whatItIs : fallback.whatItIs,
      productCategory: typeof parsed.productCategory === 'string' ? parsed.productCategory : fallback.productCategory,
      primaryColor: typeof parsed.primaryColor === 'string' ? parsed.primaryColor : fallback.primaryColor,
      keyColors: Array.isArray(parsed.keyColors) ? parsed.keyColors : fallback.keyColors,
      texture: typeof parsed.texture === 'string' ? parsed.texture : fallback.texture,
      packaging: typeof parsed.packaging === 'string' ? parsed.packaging : fallback.packaging,
      brandElements: typeof parsed.brandElements === 'string' ? parsed.brandElements : fallback.brandElements,
      visualDescriptor: typeof parsed.visualDescriptor === 'string' ? parsed.visualDescriptor : fallback.visualDescriptor,
    };
  } catch (err) {
    console.error('[analyzeProductImage] Vision analysis failed, using fallback:', err);
    return fallback;
  }
}

// ─── System Prompt (shared across all generation calls) ───────────────────────

function buildSystemPrompt(category?: string, patterns?: WinningPattern): string {
  const patternBlock = patterns
    ? `\nPROVEN WINNING PATTERNS FOR ${category}:\n${JSON.stringify(patterns, null, 2)}\n`
    : '';

  return `You are a senior creative director at a top-tier performance marketing agency.
You write director-ready video ad concepts — every shot described with enough specificity that a director can execute without asking a single question.
${patternBlock}
Rules you NEVER break:
- ONE visual hook in the first 2 seconds — a specific, concrete action, not a vibe
- Zero corporate buzzwords: no "innovative", "seamless", "elevate", "transform", "empower"
- The CTA appears EXACTLY ONCE — in the final scene only. All other scenes have isCTAScene: false.
- There is ONE continuous voiceover script. Scene narration lines are excerpts of it — not independent lines per scene.
- Never repeat the product name more than once across all scenes combined.
- No particle effects, lens flares, or glow overlays unless they serve the story — add these to doNotInclude.
- Visual style (camera, colorGrade) must stay consistent across ALL scenes.
- The final scene must be a human moment or emotional reaction — not a product-on-surface render.
- Every cut must be motivated — no random scene transitions.
- Zero generic CTAs: no "Shop now", "Try it today", "Get yours" — CTA must emotionally close the arc.
- NARRATIVE ARC is MANDATORY: Scene 1 = a specific real human PROBLEM or tension (the viewer's life before the product). Scene 2 = the product in action, visibly solving that problem. Scene 3 = the emotional resolution — the viewer's life is measurably better.
- Every visual choice must be anchored to the product's actual features and appearance.
- PRODUCT APPEARANCE: The product shown in every clip must match the actual product — same colors, same packaging, same design. Never substitute a different product.
- COLOR GRADE ENFORCEMENT: colorGrade must describe WARM, VIBRANT, RICH tones. BANNED colorGrade values: "desaturated", "muted", "monochrome", "black and white", "bleach bypass", "cold", "washed out", "faded". If one of these appears, replace it with a vibrant alternative appropriate to the theme.
- ATMOSPHERE BAN: doNotInclude must always contain "smoke effects, fog, atmospheric haze, mist, volumetric smoke trails" for every scene. Veo adds these uninstructed in indoor/moody scenes — proactively ban them.
- PHYSICAL ACTION PRECISION: Any action involving a human sense (smell, taste, touch, apply) must be written with anatomical precision — specify exact body part, position, and mechanics. EXAMPLES: For smelling perfume: write "presses wrist to nose, mouth closed, draws a slow nasal inhale — no mouth contact with skin" NOT "inhales deeply". For tasting: write "sips from cup rim, clean contact, no exaggerated mouth movement" NOT "tastes it". Vague sensation words like "inhales", "breathes in", "savours" are BANNED — always replace with precise anatomical description.
- DO NOT MAKE IT GENERIC. Every scene must be specific to THIS product, THIS audience, THIS problem. A viewer who knows the product should recognize it instantly.`;
}

function buildThemeConstraints(theme: string): string {
  const t = theme.toLowerCase()

  if (t.includes('minimalist') || t.includes('studio')) {
    return `THEME RULES:
- Setting: Clean studio, solid backgrounds, or architectural spaces ONLY
- No outdoor locations, no nature, no lifestyle contexts
- Lighting: Controlled studio light — soft boxes, rim lights, hard directional
- Color: Single accent color against neutral — NOT monochrome or desaturated
- Props: The product and one intentional prop maximum
- BANNED: forests, trails, grass, sunlight through trees, puddles, mud, running outdoors`
  }

  if (t.includes('luxury') || t.includes('premium')) {
    return `THEME RULES:
- Settings: Marble, glass, dark interiors, penthouse, gallery spaces
- Lighting: Low-key, moody, practicals (candles, city lights)
- Color: Deep rich tones — black, gold, navy, deep burgundy — still VIBRANT, never washed out
- Pacing: Slow, deliberate, every frame composed
- BANNED: bright colors, crowded spaces, fast cuts, outdoor sports, desaturated grade`
  }

  if (t.includes('energy') || t.includes('sport') || t.includes('performance')) {
    return `THEME RULES:
- Settings: Urban, gym, indoor court, streets at dusk — NOT forests or trails
- Lighting: High contrast, dramatic warm shadows
- Color: Punchy, saturated — electric blues, warm oranges, deep blacks
- Editing: Fast cuts, kinetic energy
- BANNED: peaceful nature, slow pace, soft lighting, desaturated tones`
  }

  // fallback — at minimum inject the theme as an explicit constraint
  return `THEME RULES:
- Every creative decision must visually reinforce: "${theme}"
- If a shot could appear in an ad with a different theme, cut it
- Setting, lighting, and editing rhythm must all be consistent with "${theme}"
- Color grade must be VIBRANT and WARM — never desaturated or muted`
}

// ─── User Prompt Builder ───────────────────────────────────────────────────────

function buildUserPrompt(
  productName: string,
  theme: string,
  targetAudience: string,
  features?: string,
  imageAnalysis?: ProductImageAnalysis,
  narrativeStyle: NarrativeStyle = 'ugc',
): string {
   const themeConstraints = buildThemeConstraints(theme)
   const featuresBlock = features?.trim()
    ? `\nPRODUCT FEATURES (ground every scene in these — interpret them literally):\n${features}\nExamples of literal interpretation:\n- "Mocha" = coffee flavour — show coffee, espresso, warm brown tones, morning ritual\n- "20g protein" = serious nutrition — show physical effort, recovery, real bodies not models\n- "Overnight" = ease — show the effortless prep, wake up to results\nDo NOT use features as adjectives. Make them VISIBLE on screen.`
    : ''

  const productVisualBlock = imageAnalysis
    ? `\nPRODUCT VISUAL IDENTITY (CRITICAL — every scene featuring the product MUST match these specs exactly):
- What it is: ${imageAnalysis.whatItIs}
- Packaging: ${imageAnalysis.packaging}
- Primary color: ${imageAnalysis.primaryColor}
- All colors: ${imageAnalysis.keyColors.join(', ')}
- Texture: ${imageAnalysis.texture}
- Brand elements: ${imageAnalysis.brandElements}
- Full visual descriptor: "${imageAnalysis.visualDescriptor}"
RULE: Any shot that includes the product must match this visual identity. Wrong colors, wrong shape, or wrong packaging = invalid scene. Describe the product in visualPrompt.subject using the exact details above.`
    : ''

  // ── ARC-SPECIFIC SCENE TEMPLATES ──────────────────────────────────────────

  const schema = {
    hook: "Exact first 2-second shot: subject + action + camera angle — must be a specific action",
    emotion: "Single core emotion targeted",
    narrativeArc: narrativeStyle === 'ugc'
      ? "problem → product-in-action → emotional-resolution in one sentence"
      : "raw-material-origin → craft-in-action → product-in-the-world in one sentence",
    cta: "Emotionally closes the arc — NOT a generic buy-now line",
    visualStyle: {
      camera: "Consistent camera style for entire ad",
      colorGrade: "WARM and VIBRANT grade consistent for entire ad — no desaturation",
      editingRhythm: narrativeStyle === 'ugc' ? "Pace and cut style" : "Consider fast editorial cuts for making scenes, slow reveal for final product",
      doNotInclude: "smoke effects, fog, atmospheric haze, mist, plus any other visual elements banned from entire ad",
    },
    scenes: narrativeStyle === 'ugc' ? [
      {
        sceneNumber: 1,
        durationSeconds: 6,
        description: "Opening hook — a specific human problem, NOT a product shot",
        visualPrompt: {
          subject: "A real person experiencing the specific problem this product solves",
          action: "A concrete physical action showing the frustration or tension",
          cameraAngle: "Camera angle that serves the scene's emotional intent",
          lighting: "Lighting that matches the visual style — must be WARM and VIBRANT",
          colorGrade: "Warm, vibrant color grade — e.g. 'golden hour warmth, rich midtones, punchy shadows'",
          doNotInclude: "The product itself, any solution — this is the PROBLEM scene. smoke effects, fog, haze",
        },
        narration: null,
        onScreenText: null,
        isCTAScene: false,
        emotionBeat: "Viewer recognizes their own frustration — they lean in",
      },
      "// scene 2 — product actively solving the problem, durationSeconds: 6",
      "// scene 3 — emotional resolution + CTA (human transformation visible), durationSeconds: 6, isCTAScene: true",
    ] : [
      {
        sceneNumber: 1,
        durationSeconds: 6,
        description: "ORIGIN / RAW MATERIAL — where this product begins. No full product reveal yet.",
        visualPrompt: {
          subject: "The raw source material, ingredient, or natural origin of this product — almost abstract, textural",
          action: "Extreme close-up revealing texture and material quality — something the viewer has never seen this closely before",
          cameraAngle: "Macro lens, ultra-close-up — fill the frame with texture, no context yet",
          lighting: "Dramatic directional light that reveals material texture — shadows accentuate grain, fiber, or surface",
          colorGrade: "Rich, deep tones that communicate premium material — warm if natural, cool if technical",
          doNotInclude: "The finished product, any human faces, generic product shot, smoke effects, fog, haze",
        },
        narration: null,
        onScreenText: null,
        isCTAScene: false,
        emotionBeat: "Viewer is intrigued — 'what IS this?' — immediate curiosity hook",
      },
      "// scene 2 — THE CRAFT IN ACTION: hands, tools, process. Fast editorial cuts. Multiple angles. Energy of making. durationSeconds: 6",
      "// scene 3 — FINISHED PRODUCT IN THE WORLD: the product worn/used/consumed in a powerful real-world moment. Human connection. CTA. durationSeconds: 6, isCTAScene: true",
    ],
    voiceoverScript: {
      fullScript: "Complete VO as one continuous piece read start to finish",
      voiceTone: narrativeStyle === 'ugc' ? "Single tone matching the emotional arc" : "Reverent, craft-focused — think documentary narrator reverence for process",
      sceneAssignments: {
        scene_1: narrativeStyle === 'ugc' ? "Opening emotional line — the viewer's pain, or null" : "Wonder line — evokes the origin or source, or null (~12 words max)",
        scene_2: narrativeStyle === 'ugc' ? "Product-in-action line — the turning point (~12 words max)" : "Craft line — the skill, the precision, the intention (~12 words max)",
        scene_3: "CTA line — emotionally closes the arc (~12 words max)",
      },
    },
    voiceType: { gender: "female", tone: "calm", pace: "medium" },
    musicMood: narrativeStyle === 'ugc' ? "upbeat" : "dramatic",
    tagline: "Memorable closing line — spoken, not generic",
  };

  // Arc-specific structure instructions
  const structureBlock = narrativeStyle === 'ugc'
    ? `NARRATIVE ARC: UGC / TRANSFORMATION
- Scene 1: Human PROBLEM — a specific, relatable frustration WITHOUT the product. Make the viewer feel the pain.
- Scene 2: Product ACTIVELY SOLVING — product in direct, visible action. Must show HOW it solves the problem physically.
- Scene 3: Emotional RESOLUTION — the viewer's life is measurably better. Close on a human moment, not the product.`
    : `NARRATIVE ARC: CRAFT / ORIGIN STORY
- This product's value is in HOW IT IS MADE and the materials used — NOT in a before/after transformation.
- BANNED: Do NOT use the UGC formula (problem → solution → relief). It is the WRONG arc for this product.
- Scene 1: RAW MATERIAL or ORIGIN — extreme close-up of the source material. Almost abstract. Textural. The viewer should wonder 'what is this?'
  Examples: sole foam being compressed and releasing; natural grain being milled; leather fiber close-up; rubber being molded under pressure; leaves being hand-picked
- Scene 2: THE CRAFT IN ACTION — the making. Hands, tools, energy, precision. Fast editorial cuts across multiple process angles. Show the SKILL and INTENTION behind the product.
  Examples: stitching detail; sole-to-upper bonding; grind and pack; handcrafting leather; precision assembly
- Scene 3: PRODUCT IN THE WORLD — the finished product worn/used/consumed in one powerful real-world moment. This is the payoff — quality made real.
  Examples: shoe sole hitting the court from low angle; matcha steam rising as first sip is taken; watch clasp closing on a wrist`;

  return `Product: ${productName}
Target Audience: ${targetAudience}
Narrative Style: ${narrativeStyle.toUpperCase()} — follow the arc below exactly.
${productVisualBlock}
${featuresBlock}
THEME: ${theme}
THEME IS THE HIGHEST PRIORITY CONSTRAINT. Every scene, lighting choice, camera angle, and setting must serve this theme.
${themeConstraints}

${structureBlock}

STRUCTURE — NON-NEGOTIABLE:
- Exactly 3 scenes. No more. No fewer.
- Every scene is exactly 6 seconds. durationSeconds must be 6 for all scenes.
- Total ad duration: 18 seconds.
- Voiceover per scene must be writable in under 6 seconds of audio (~12-14 words max per scene).
- scene_3 is the ONLY CTA scene. scenes 1 and 2 have isCTAScene: false.

Generate a director-ready video ad concept. Return ONLY valid JSON — no markdown, no explanation.

JSON schema (follow exactly):
${JSON.stringify(schema, null, 2)}`;
}


function buildFallbackScene(sceneNumber: number, productName: string) {
  const isFirst = sceneNumber === 1;
  const isSecond = sceneNumber === 2;

  return {
    sceneNumber,
    durationSeconds: 6 as const, // always 6 seconds (Veo supported)
    description: isFirst ? 'Opening hook — human problem scene' : isSecond ? 'Product in action' : 'Emotional resolution',
    visualPrompt: {
      subject: isFirst ? 'A person experiencing the problem this product solves' : isSecond ? productName : 'A person with visible positive emotion',
      action: isFirst ? 'Concrete physical action showing the frustration' : isSecond ? 'Using the product in a specific, purposeful way' : 'Reacting to the positive outcome',
      cameraAngle: 'Cinematic commercial framing',
      lighting: 'Warm, high-contrast lighting — rich and vibrant',
      colorGrade: 'Warm golden tones, punchy midtones, rich shadows — full color',
      doNotInclude: 'Desaturated tones, black and white, lens flares, floating product renders',
    },
    narration: sceneNumber === 3 ? 'The moment that changes everything.' : null,
    onScreenText: null,
    isCTAScene: false,
    emotionBeat: isFirst ? 'Immediate recognition — the viewer knows this frustration' : isSecond ? 'Rising anticipation' : 'Satisfying relief',
  };
}

function normalizeAdConceptCandidate(parsed: unknown, productName: string): unknown {
  const candidate = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};

  // Always exactly 3 scenes — truncate extras, pad missing with nulls
  const rawScenes = Array.isArray(candidate.scenes) ? [...candidate.scenes].slice(0, 3) : [];
  while (rawScenes.length < 3) {
    rawScenes.push(null);
  }

  const normalizedScenes = rawScenes.map((rawScene, index) => {
    const sceneNumber = index + 1;
    const fallback = buildFallbackScene(sceneNumber, productName);
    const scene = typeof rawScene === 'object' && rawScene !== null ? (rawScene as Record<string, unknown>) : {};
    const visual = typeof scene.visualPrompt === 'object' && scene.visualPrompt !== null
      ? (scene.visualPrompt as Record<string, unknown>)
      : {};

    // Sanitize colorGrade — replace banned values with a vibrant alternative
    const BANNED_GRADES = /desaturat|muted|monochrom|black.*white|bleach.bypass|washed.out|faded|cold.grade/i;
    let colorGrade = typeof visual.colorGrade === 'string' ? visual.colorGrade : fallback.visualPrompt.colorGrade;
    if (BANNED_GRADES.test(colorGrade)) {
      colorGrade = 'Warm golden tones, punchy midtones, rich saturated shadows — full vibrant color';
    }

    return {
      sceneNumber,
      durationSeconds: 6 as const, // always locked to 6 — ignore whatever GPT returned
      description: typeof scene.description === 'string' ? scene.description : fallback.description,
      visualPrompt: {
        subject: typeof visual.subject === 'string' ? visual.subject : fallback.visualPrompt.subject,
        action: typeof visual.action === 'string' ? visual.action : fallback.visualPrompt.action,
        cameraAngle: typeof visual.cameraAngle === 'string' ? visual.cameraAngle : fallback.visualPrompt.cameraAngle,
        lighting: typeof visual.lighting === 'string' ? visual.lighting : fallback.visualPrompt.lighting,
        colorGrade,
        doNotInclude: typeof visual.doNotInclude === 'string' ? visual.doNotInclude : fallback.visualPrompt.doNotInclude,
      },
      narration: typeof scene.narration === 'string' || scene.narration === null ? scene.narration : fallback.narration,
      onScreenText: typeof scene.onScreenText === 'string' || scene.onScreenText === null ? scene.onScreenText : null,
      isCTAScene: false,
      emotionBeat: typeof scene.emotionBeat === 'string' ? scene.emotionBeat : fallback.emotionBeat,
    };
  });

  normalizedScenes.forEach((scene, index) => {
    scene.isCTAScene = index === normalizedScenes.length - 1;
  });

  const voiceover = typeof candidate.voiceoverScript === 'object' && candidate.voiceoverScript !== null
    ? (candidate.voiceoverScript as Record<string, unknown>)
    : {};
  const voiceAssignments = typeof voiceover.sceneAssignments === 'object' && voiceover.sceneAssignments !== null
    ? (voiceover.sceneAssignments as Record<string, unknown>)
    : {};

  const sceneAssignments = normalizedScenes.reduce<Record<string, string | null>>((acc, scene) => {
    const key = `scene_${scene.sceneNumber}`;
    const assignment = voiceAssignments[key];
    acc[key] = typeof assignment === 'string' ? assignment : null;
    return acc;
  }, {});

  const fallbackCta = typeof candidate.cta === 'string' ? candidate.cta : 'See what happens when you try it.';
  const lastSceneKey = `scene_${normalizedScenes.length}`;
  if (!sceneAssignments[lastSceneKey]) {
    sceneAssignments[lastSceneKey] = fallbackCta;
  }

  const visualStyle = typeof candidate.visualStyle === 'object' && candidate.visualStyle !== null
    ? (candidate.visualStyle as Record<string, unknown>)
    : {};
  const voiceType = typeof candidate.voiceType === 'object' && candidate.voiceType !== null
    ? (candidate.voiceType as Record<string, unknown>)
    : {};

  // Sanitize top-level colorGrade too
  const BANNED_GRADES = /desaturat|muted|monochrom|black.*white|bleach.bypass|washed.out|faded/i;
  let topColorGrade = typeof visualStyle.colorGrade === 'string' ? visualStyle.colorGrade : 'Warm golden tones, punchy midtones, rich color — full saturation';
  if (BANNED_GRADES.test(topColorGrade)) {
    topColorGrade = 'Warm golden tones, punchy midtones, rich color — full saturation';
  }

  return {
    hook: typeof candidate.hook === 'string' ? candidate.hook : `A striking opening moment for ${productName}`,
    emotion: typeof candidate.emotion === 'string' ? candidate.emotion : 'Anticipation',
    narrativeArc: typeof candidate.narrativeArc === 'string' ? candidate.narrativeArc : 'problem -> product-in-action -> emotional-resolution',
    cta: fallbackCta,
    visualStyle: {
      camera: typeof visualStyle.camera === 'string' ? visualStyle.camera : 'Cinematic handheld with intentional closeups',
      colorGrade: topColorGrade,
      editingRhythm: typeof visualStyle.editingRhythm === 'string' ? visualStyle.editingRhythm : 'Fast-open then settle into rhythmic cuts',
      doNotInclude: typeof visualStyle.doNotInclude === 'string' ? visualStyle.doNotInclude : 'Lens flares, floating product renders, generic b-roll, desaturated tones',
    },
    scenes: normalizedScenes,
    voiceoverScript: {
      fullScript: typeof voiceover.fullScript === 'string' ? voiceover.fullScript : 'A concise, emotional script that matches each scene.',
      voiceTone: typeof voiceover.voiceTone === 'string' ? voiceover.voiceTone : 'Confident and human',
      sceneAssignments,
    },
    voiceType: {
      gender: voiceType.gender,
      tone: voiceType.tone,
      pace: voiceType.pace,
    },
    musicMood: candidate.musicMood,
    tagline: typeof candidate.tagline === 'string' ? candidate.tagline : 'The moment it clicks, everything changes.',
  };
}

function buildIdeationPrompt(theme: string, productDescription: string): string {
  return `Product: ${productDescription}
Theme/Tone: ${theme}

Generate a sharp, scroll-stopping ad concept summary in one paragraph.
Return ONLY valid JSON with this exact shape:
{
  "idea": "A concise 3-5 sentence idea with a single hook, the core emotion, and the payoff"
}`;
}

// ─── Core Generation (single function, all paths) ─────────────────────────────

async function generateAdConceptRaw(
  productName: string,
  theme: string,
  targetAudience: string,
  category?: string,
  patterns?: WinningPattern,
  features?: string,
  imageAnalysis?: ProductImageAnalysis,
  narrativeStyle?: NarrativeStyle,
): Promise<AdConcept> {
  let lastErr: unknown = null;

  // Auto-detect narrative style if not explicitly provided
  const resolvedStyle: NarrativeStyle = narrativeStyle
    ?? detectNarrativeStyle(productName, features ?? '', imageAnalysis?.productCategory);

  console.log(`[AI] Narrative style: ${resolvedStyle} (product: ${productName})`);

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await openai.chat.completions.create({
        model: 'gpt-4o',                          // consistent across all paths
        temperature: 1.0,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: buildSystemPrompt(category, patterns) },
          { role: 'user', content: buildUserPrompt(productName, theme, targetAudience, features, imageAnalysis, resolvedStyle) },
        ],
      });

      const raw = res.choices[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(raw);
      const normalized = normalizeAdConceptCandidate(parsed, productName);
      return AdConceptSchema.parse(normalized);
    } catch (err) {
      lastErr = err;
      console.error(`Ad concept gen failed (attempt ${attempt}/3):`, err);
      await new Promise(r => setTimeout(r, 500 * attempt));
    }
  }

  throw new Error(`Failed to generate ad concept: ${(lastErr as Error)?.message ?? lastErr}`);
}


// ─── Public API ───────────────────────────────────────────────────────────────

/** Basic generation — theme + product only */
export async function generateAdConcept(
  productName: string,
  theme: string,
  targetAudience: string = 'general audience',
  features?: string,
  imageAnalysis?: ProductImageAnalysis,
  narrativeStyle?: NarrativeStyle,
): Promise<AdConcept> {
  return generateAdConceptRaw(productName, theme, targetAudience, undefined, undefined, features, imageAnalysis, narrativeStyle);
}

/** Competitive intelligence generation — uses winning patterns */
export async function generateAdConceptWithPatterns(
  productName: string,
  theme: string,
  category: string,
  targetAudience: string,
  patterns: WinningPattern,
  features?: string,
  imageAnalysis?: ProductImageAnalysis,
  narrativeStyle?: NarrativeStyle,
): Promise<AdConcept> {
  return generateAdConceptRaw(productName, theme, targetAudience, category, patterns, features, imageAnalysis, narrativeStyle);
}

// ─── Pipeline Helper — maps AdConcept scenes to your video gen calls ──────────

export function buildClipJobs(concept: AdConcept) {
  return concept.scenes.map((scene) => ({
    sceneNumber: scene.sceneNumber,
    durationSeconds: scene.durationSeconds,

    // Flat visual prompt string for Kling/Veo — built from structured fields
    videoGenPrompt: [
      scene.visualPrompt.subject,
      scene.visualPrompt.action,
      scene.visualPrompt.cameraAngle,
      scene.visualPrompt.lighting,
      scene.visualPrompt.colorGrade,
      `AVOID: ${scene.visualPrompt.doNotInclude}`,
    ].join('. '),

    // VO line from unified script — never independently generated per clip
    narration: concept.voiceoverScript.sceneAssignments[`scene_${scene.sceneNumber}`] ?? null,
    voiceTone: concept.voiceoverScript.voiceTone,
    voiceType: concept.voiceType,

    // CTA is null for all scenes except the last
    ctaText: scene.isCTAScene ? concept.cta : null,
    onScreenText: scene.onScreenText,

    emotionBeat: scene.emotionBeat,
    musicMood: concept.musicMood,
  }));
}

export async function generateIdeationPrompt(
  theme: string,
  productDescription: string,
): Promise<IdeationPromptResult> {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.9,
    max_tokens: 250,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are a senior creative director.
Write a single sharp ad concept summary. Keep it specific, visual, and non-generic. Return only JSON.`,
      },
      {
        role: 'user',
        content: buildIdeationPrompt(theme, productDescription),
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content || '{"idea":"A creative ad"}';
  const parsed = JSON.parse(raw);
  return {
    idea: typeof parsed.idea === 'string' ? parsed.idea : 'A creative ad',
  };
}