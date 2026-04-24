import { NextRequest, NextResponse } from 'next/server';
import { generateVideo } from '@/lib/veo';
import { updateProject } from '@/lib/db';

interface SceneInput {
  duration?: number;
  description?: string;
  visualPrompt?: string;
  narration?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const projectId = body.projectId as string | undefined;
    const shotUrls = body.shotUrls as string[] | undefined;
    const imageUrl = body.imageUrl as string | undefined;
    const scenes = body.scenes as SceneInput[] | undefined;
    const productName = (body.productName as string | undefined) || 'Product';
    const cta = (body.cta as string | undefined) || 'Shop now';
    const category = (body.category as string | undefined) || 'product';
    const persistProject = Boolean(projectId) && (body.persistProject ?? true);

    if (!Array.isArray(scenes) || scenes.length === 0) {
      return NextResponse.json({ error: 'scenes is required and must be a non-empty array' }, { status: 400 });
    }

    const referenceImageUrl = imageUrl || shotUrls?.[0] || null;
    if (!referenceImageUrl) {
      return NextResponse.json({ error: 'imageUrl or shotUrls[0] is required for Veo image-to-video' }, { status: 400 });
    }

    if (persistProject && projectId) {
      await updateProject(projectId, { status: 'video', progressStep: 'Step 3: generating single-shot Veo hero ad' });
    }

    const rawVideoUrl = await generateVideo(referenceImageUrl, scenes, {
      productName,
      cta,
      category,
      durationSeconds: 15,
      styleHint: scenes[0]?.visualPrompt || scenes[0]?.description,
    });

    if (persistProject && projectId) {
      await updateProject(projectId, { status: 'finalizing', progressStep: 'Step 3: finalizing Veo output' });
    }

    const finalVideoUrl = rawVideoUrl;

    if (persistProject && projectId) {
      await updateProject(projectId, {
        status: 'done',
        progressStep: 'Step 3 test complete',
        videoUrl: finalVideoUrl,
        error: null,
      });
    }

    return NextResponse.json({
      status: 'ok',
      projectId: projectId || null,
      step3Only: true,
      videoUrl: finalVideoUrl,
      rawVideoUrl,
      finalVideoUrl,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Step 3 test failed' }, { status: 500 });
  }
}
