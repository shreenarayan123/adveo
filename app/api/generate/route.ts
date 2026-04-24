import { NextRequest, NextResponse } from 'next/server';
import { createProject, updateProject, startPipeline } from '@/lib/db';
import { prisma } from '@/lib/prisma';
import { generateAdConcept, generateAdConceptWithPatterns, analyzeProductImage, type WinningPattern } from '@/lib/ai';

// Maps the UI voiceOptions IDs to real ElevenLabs voice IDs
const VOICE_MAP: Record<string, string> = {
  'excited-male':  'pNInz6obpgDQGcFmaJgB', // Adam — energetic male
  'calm-female':   'ThT5KcBeYPX3keUQqHPh', // Dorothy — calm female
  'deep-male':     'VR6AewLTigWG4xSOukaG', // Arnold — deep authoritative male
  'young-female':  'EXAVITQu4vr4xnSDxMaL', // Bella — energetic female
  'old-male':      'VR6AewLTigWG4xSOukaG', // Arnold — warm trustworthy
  'narrator':      'VR6AewLTigWG4xSOukaG', // Arnold — documentary style
};
const DEFAULT_VOICE_ID = 'ThT5KcBeYPX3keUQqHPh'; // Dorothy (calm female) as fallback

function withGenerationMeta(script: any, meta: {
  brand: string;
  productDescription: string;
  features: string;
  cta: string;
  targetAudience: string;
}) {
  if (!script || typeof script !== 'object') return script;
  return {
    ...script,
    _meta: {
      ...(script._meta || {}),
      ...meta,
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    const {
      imageUrl, theme,
      brand = 'Brand',
      productDescription = 'Product',
      features = '',            // e.g. "20g protein, Mocha Marvel flavour"
      targetAudience = 'general audience',
      customScriptJson,
      voice
    } = await req.json();

    if (!imageUrl || !theme) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

    // Resolve to a concrete ElevenLabs voice ID
    const voiceId = VOICE_MAP[voice] || DEFAULT_VOICE_ID;

    let finalScriptJson = customScriptJson;
    let scriptObj = null;
    const scriptCategory = 'general';

    // productIdentity includes features so GPT has full product context
    const productIdentity = features
      ? `${brand} — ${productDescription}. Key features: ${features}`
      : `${brand} — ${productDescription}`;

    // Run product image analysis in parallel with pattern fetch for speed
    const [patternsRow, imageAnalysis] = await Promise.all([
      prisma.adPattern.findUnique({
        where: { category_theme: { category: scriptCategory, theme } },
      }).catch(() => null),
      imageUrl
        ? analyzeProductImage(imageUrl).catch((err) => {
            console.warn('[Generate API] Image analysis failed, continuing:', err);
            return undefined;
          })
        : Promise.resolve(undefined),
    ]);

    console.log('[Generate API] Product image analysis:', imageAnalysis);

    if (!finalScriptJson) {
      const patterns = patternsRow?.patterns as WinningPattern | undefined;
      try {
        scriptObj = patterns && Object.keys(patterns).length
          ? await generateAdConceptWithPatterns(
              productIdentity, theme, scriptCategory, targetAudience, patterns, features, imageAnalysis
            )
          : await generateAdConcept(productIdentity, theme, targetAudience, features, imageAnalysis);

        // Store the generated CTA from GPT — don't override with 'Shop now'
        const generatedCta = scriptObj.cta || scriptObj.tagline || 'See what happens when you try it.';
        scriptObj = withGenerationMeta(scriptObj, { brand, productDescription, features, cta: generatedCta, targetAudience });
        finalScriptJson = JSON.stringify(scriptObj);
      } catch (err: any) {
        console.error('Script generation failed:', err);
        return NextResponse.json({ error: 'Script generation failed' }, { status: 500 });
      }
    } else {
      scriptObj = JSON.parse(finalScriptJson);
      const generatedCta = scriptObj.cta || scriptObj.tagline || 'See what happens when you try it.';
      scriptObj = withGenerationMeta(scriptObj, { brand, productDescription, features, cta: generatedCta, targetAudience });
      finalScriptJson = JSON.stringify(scriptObj);
    }

    // Create project — store voiceId so the pipeline can use it
    const project = await createProject({ imageUrl, theme, scriptJson: finalScriptJson, voiceId });
    await updateProject(project.id, { progressStep: 'Script generated', status: 'script' });

    // Kick off background pipeline (non-blocking)
    startPipeline(project.id);

    return NextResponse.json({ status: 'started', projectId: project.id, script: scriptObj });
  } catch (e) {
    console.error('Generate error:', e);
    return NextResponse.json({ error: 'Failed to start generation' }, { status: 500 });
  }
}
