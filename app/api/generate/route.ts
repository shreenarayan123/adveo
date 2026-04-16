import { NextRequest, NextResponse } from 'next/server';
import { createProject, updateProject, startPipeline } from '@/lib/db';
import { prisma } from '@/lib/prisma';
import { generateScript } from '@/lib/ai';

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

export async function POST(req: NextRequest) {
  try {
    const {
      imageUrl, theme,
      category = 'beauty',
      productName = 'Product',
      targetAudience = 'general',
      customScriptJson,
      voice   // UI voice selection e.g. "calm-female"
    } = await req.json();

    if (!imageUrl || !theme) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

    // Resolve to a concrete ElevenLabs voice ID
    const voiceId = VOICE_MAP[voice] || DEFAULT_VOICE_ID;

    let finalScriptJson = customScriptJson;
    let scriptObj = null;

    if (!finalScriptJson) {
      const patternsRow = await prisma.adPattern.findUnique({
        where: { category_theme: { category, theme } },
      });
      const patterns = patternsRow?.patterns || {};
      try {
        scriptObj = await generateScript(productName, theme, category, targetAudience, patterns);
        finalScriptJson = JSON.stringify(scriptObj);
      } catch (err: any) {
        console.error('Script generation failed:', err);
        return NextResponse.json({ error: 'Script generation failed' }, { status: 500 });
      }
    } else {
      scriptObj = JSON.parse(finalScriptJson);
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
