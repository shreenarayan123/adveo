import { updateProject } from './db';
import { prisma } from './prisma';
import { generateAdConcept, analyzeProductImage, type AdConcept } from './ai';
import { generateVideo } from './veo';
import { generateVoice, generateBGM } from './elevenlabs';
import { mergeAudioVideo, concatenateClips } from './ffmpeg';
import { saveFinalVideo } from './storage';

type NormalizedScene = AdConcept['scenes'][number];

function normalizeConcept(rawScript: any): AdConcept {
  if (rawScript?.voiceoverScript && Array.isArray(rawScript?.scenes)) {
    return rawScript as AdConcept;
  }

  const scenes: NormalizedScene[] = Array.isArray(rawScript?.scenes)
    ? rawScript.scenes.map((scene: any, index: number): NormalizedScene => {
        const narration = scene.narration ?? null;
        const visualPrompt = typeof scene.visualPrompt === 'string'
          ? {
              subject: '',
              action: scene.visualPrompt || scene.description || '',
              cameraAngle: '',
              lighting: '',
              colorGrade: '',
              doNotInclude: '',
            }
          : scene.visualPrompt || {
              subject: '',
              action: scene.description || '',
              cameraAngle: '',
              lighting: '',
              colorGrade: '',
              doNotInclude: '',
            };

        return {
          sceneNumber: scene.sceneNumber ?? index + 1,
          durationSeconds: scene.durationSeconds ?? scene.duration ?? 6,
          description: scene.description ?? '',
          visualPrompt,
          narration,
          onScreenText: scene.onScreenText ?? null,
          isCTAScene: Boolean(scene.isCTAScene ?? index === rawScript.scenes.length - 1),
          emotionBeat: scene.emotionBeat ?? '',
        };
      })
    : [];

  const sceneAssignments: Record<string, string | null> = {};
  for (const scene of scenes) {
    sceneAssignments[`scene_${scene.sceneNumber}`] = scene.narration ?? null;
  }

  const fullScript = scenes
    .map((scene) => scene.narration)
    .filter((line): line is string => Boolean(line))
    .join(' ');

  return {
    hook: rawScript?.hook ?? rawScript?.title ?? '',
    emotion: rawScript?.emotion ?? '',
    narrativeArc: rawScript?.narrativeArc ?? rawScript?.narrative_arc ?? '',
    cta: rawScript?.cta ?? rawScript?.tagline ?? 'See what happens when you try it.',
    visualStyle: rawScript?.visualStyle ?? {
      camera: '',
      colorGrade: '',
      editingRhythm: '',
      doNotInclude: '',
    },
    scenes,
    voiceoverScript: rawScript?.voiceoverScript ?? {
      fullScript,
      voiceTone: rawScript?.voiceType?.tone ?? 'calm',
      sceneAssignments,
    },
    voiceType: rawScript?.voiceType ?? {
      gender: 'female',
      tone: 'calm',
      pace: 'medium',
    },
    musicMood: rawScript?.musicMood ?? 'upbeat',
    tagline: rawScript?.tagline ?? rawScript?.cta ?? '',
  };
}

/**
 * Ensures the narration script is long enough for an 18-second ad.
 * If the GPT-generated fullScript is too short (< 80 chars), rebuild it
 * from all scene narration lines + the CTA to guarantee ElevenLabs
 * has enough content to fill the full video duration.
 */
function ensureFullNarration(concept: AdConcept): string {
  const rawFull = concept.voiceoverScript?.fullScript?.trim() || '';

  if (rawFull.length >= 200) {
    console.log('[Pipeline] fullScript OK, length:', rawFull.length);
    return rawFull;
  }

  console.warn(`[Pipeline] fullScript too short (${rawFull.length} chars, target ≥200) — rebuilding from scene narrations.`);

  // Collect all scene narration lines
  const narrationLines: string[] = (concept.scenes || [])
    .map((s: any) => (s.narration || '').trim())
    .filter((line: string) => line.length > 0);

  // Also grab hook and CTA if available
  const hook = concept.hook?.trim() || '';
  const cta = concept.cta?.trim() || concept.tagline?.trim() || '';

  const parts = [
    hook,
    ...narrationLines,
    cta,
  ].filter(Boolean);

  const rebuilt = parts.join(' ');

  if (rebuilt.length >= 20) {
    console.log('[Pipeline] Rebuilt fullScript from scenes:', rebuilt.substring(0, 120) + (rebuilt.length > 120 ? '...' : ''));
    return rebuilt;
  }

  // Last resort: use the raw short script or a generic fallback
  const fallback = rawFull || `Experience the difference. ${cta || 'Try it today.'}`;
  console.warn('[Pipeline] Using fallback script:', fallback);
  return fallback;
}

export async function generatePipeline(projectId: string) {
  try {
    await updateProject(projectId, { status: 'script', progressStep: 'Gathering script data' });
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new Error('Project not found');

    let concept: AdConcept;
    let projectMeta: {
      brand?: string;
      productDescription?: string;
      features?: string;
      cta?: string;
      targetAudience?: string;
      orientation?: string;
    } = {};

    if (project.scriptJson) {
      const parsed = JSON.parse(project.scriptJson);
      concept = normalizeConcept(parsed);
      projectMeta = parsed?._meta || {};
    } else {
      concept = await generateAdConcept('Product', project.theme, 'general audience');
    }

    const brand              = projectMeta?.brand || 'Brand';
    const productDescription = projectMeta?.productDescription || 'Product';
    const productName        = `${brand} ${productDescription}`.trim();
    const cta                = projectMeta?.cta || concept.cta || concept.tagline || 'See what happens when you try it.';
    const category           = 'product';
    // Read orientation from DB field (most reliable) or fall back to _meta
    const orientation        = (project as any).orientation || projectMeta?.orientation || 'vertical';
    const musicMood          = concept.musicMood || project.theme || 'upbeat';

    console.log(`[Pipeline] Orientation: ${orientation} | Music mood: ${musicMood}`);

    // Step 1: Vision-analyze the product image so Veo gets accurate product specs in prompts.
    let imageAnalysis = undefined;
    if (project.imageUrl) {
      await updateProject(projectId, { status: 'script', progressStep: 'Analyzing product image' });
      console.log('[Pipeline] Analyzing product image for visual context:', project.imageUrl);
      try {
        imageAnalysis = await analyzeProductImage(project.imageUrl);
        console.log('[Pipeline] Product analysis:', JSON.stringify(imageAnalysis));
      } catch (err) {
        console.warn('[Pipeline] Product image analysis failed, continuing without it:', err);
      }
    }

    // ── OPTION A: MASTER AUDIO ARCHITECTURE ──────────────────────────────────
    // 1. Generate all 3 Veo clips MUTED (generateAudio: false).
    // 2. Concatenate the 3 muted clips into one 18s video (at the correct resolution).
    // 3a. Generate ONE continuous ElevenLabs narration for the full script.
    // 3b. Generate ONE ElevenLabs BGM track (18s, mood-matched).
    // 4. Mix narration @ 100% + BGM @ 20% over the silent 18s video — one FFmpeg call.
    // ─────────────────────────────────────────────────────────────────────────

    const masterStyleGuide = (concept as any).masterStyleGuide as string | undefined;
    if (masterStyleGuide) {
      console.log('[Pipeline] Master style guide:', masterStyleGuide.substring(0, 120) + '...');
    }

    // Step 2: Generate 3 MUTED Veo clips (Option A — no per-clip BGM).
    await updateProject(projectId, { status: 'video', progressStep: 'Generating clip 1 of 3 (muted)' });
    const mutedClipUrls = await generateVideo(project.imageUrl, concept.scenes, {
      productName,
      cta,
      category,
      imageAnalysis,
      imageUrl: project.imageUrl,
      features: projectMeta?.features,
      masterStyleGuide,
      generateAudio: false,   // Option A: clips are silent — narration is the master audio
      orientation,            // horizontal or vertical → controls Veo resolution + FFmpeg scale
      styleHint: [
        concept.scenes[0]?.visualPrompt?.subject,
        concept.scenes[0]?.visualPrompt?.action,
        concept.scenes[0]?.visualPrompt?.cameraAngle,
      ].filter(Boolean).join('. '),
    });

    // Step 3: Prepare narration + BGM concurrently for speed.
    const fullScript = ensureFullNarration(concept);

    let finalVideoUrl = mutedClipUrls;

    if (fullScript.trim()) {
      await updateProject(projectId, { status: 'audio', progressStep: 'Generating narration & BGM tracks' });
      console.log('[Pipeline] Generating narration (full 18s):', fullScript.substring(0, 120) + '...');
      console.log('[Pipeline] Generating BGM track — mood:', musicMood);

      // Run narration + BGM generation in parallel for speed
      const [audioUrl, bgmUrl] = await Promise.all([
        generateVoice(fullScript, project.voiceId),
        generateBGM(musicMood).catch((err) => {
          // BGM is non-critical — log warning and continue without it
          console.warn('[Pipeline] BGM generation failed, continuing without BGM:', err.message);
          return null;
        }),
      ]);

      console.log('[Pipeline] Narration URL:', audioUrl);
      console.log('[Pipeline] BGM URL:', bgmUrl || '(none)');

      // Step 4: Mix narration + BGM over the muted 18s video — one FFmpeg call.
      await updateProject(projectId, { status: 'audio', progressStep: 'Mixing narration & BGM into final video' });
      const merged = await mergeAudioVideo(mutedClipUrls, audioUrl, bgmUrl ?? undefined, orientation);
      finalVideoUrl = merged.url;
      console.log('[Pipeline] Master audio mixed. Final video:', finalVideoUrl);
    } else {
      console.warn('[Pipeline] No narration script — final video is silent (sensory ad).');
    }

    await saveFinalVideo(projectId, finalVideoUrl);
    await updateProject(projectId, { status: 'done', progressStep: 'Done', videoUrl: finalVideoUrl });
    console.log('[Pipeline] Complete! Final video:', finalVideoUrl);
  } catch (e: any) {
    await updateProject(projectId, { status: 'error', error: e.message });
    console.error('Pipeline error:', e);
  }
}
