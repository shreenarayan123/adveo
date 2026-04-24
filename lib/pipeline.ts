import { updateProject } from './db';
import { prisma } from './prisma';
import { generateAdConcept, analyzeProductImage, type AdConcept } from './ai';
import { generateVideo } from './veo';
import { generateVoice } from './elevenlabs';
import { mergeAudioVideo } from './ffmpeg';
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

export async function generatePipeline(projectId: string) {
  try {
    await updateProject(projectId, { status: 'script', progressStep: 'Gathering script data' });
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new Error('Project not found');

    let concept: AdConcept;
    let projectMeta: { brand?: string; productDescription?: string; features?: string; cta?: string; targetAudience?: string } = {};

    if (project.scriptJson) {
      const parsed = JSON.parse(project.scriptJson);
      concept = normalizeConcept(parsed);
      projectMeta = parsed?._meta || {};
    } else {
      concept = await generateAdConcept('Product', project.theme, 'general audience');
    }

    const brand            = projectMeta?.brand || 'Brand';
    const productDescription = projectMeta?.productDescription || 'Product';
    const productName      = `${brand} ${productDescription}`.trim();
    const cta              = projectMeta?.cta || concept.cta || concept.tagline || 'See what happens when you try it.';
    const category         = 'product';

    // Step 1: Vision-analyze the product image so Veo gets accurate product specs in prompts.
    // This extracts colors, packaging, and visual identity from the real product photo.
    // The result is injected as text into all Veo prompts — NOT passed as image-to-video.
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

    // Step 2: Generate the 3 video clips with product visual context injected into prompts
    await updateProject(projectId, { status: 'video', progressStep: 'Generating clip 1 of 3' });
    const rawVideoUrl = await generateVideo(project.imageUrl, concept.scenes, {
      productName,
      cta,
      category,
      imageAnalysis,
      styleHint: [
        concept.scenes[0]?.visualPrompt?.subject,
        concept.scenes[0]?.visualPrompt?.action,
        concept.scenes[0]?.visualPrompt?.cameraAngle,
      ].filter(Boolean).join('. '),
    });

    // Step 3: Generate ElevenLabs voiceover and mix with Veo's ambient audio
    const fullScript = concept.voiceoverScript?.fullScript || concept.tagline || '';
    let finalVideoUrl = rawVideoUrl;

    if (fullScript.trim()) {
      await updateProject(projectId, { status: 'audio', progressStep: 'Generating voiceover' });
      console.log('[Pipeline] Generating voiceover for script:', fullScript.substring(0, 100) + '...');
      const audioUrl = await generateVoice(fullScript, project.voiceId);

      await updateProject(projectId, { status: 'audio', progressStep: 'Mixing audio and video' });
      const merged = await mergeAudioVideo(rawVideoUrl, audioUrl);
      finalVideoUrl = merged.url;
    } else {
      console.warn('[Pipeline] No voiceover script found — skipping TTS, using raw video');
    }

    await saveFinalVideo(projectId, finalVideoUrl);
    await updateProject(projectId, { status: 'done', progressStep: 'Done', videoUrl: finalVideoUrl });
    console.log('[Pipeline] Complete! Final video:', finalVideoUrl);
  } catch (e: any) {
    await updateProject(projectId, { status: 'error', error: e.message });
    console.error('Pipeline error:', e);
  }
}
