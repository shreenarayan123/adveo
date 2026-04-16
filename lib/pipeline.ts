import { updateProject } from './db';
import { prisma } from './prisma';
import { generateIdeationPrompt, generateScriptPrompt } from './ai';
import { generateProductShots } from './nana';
import { generateVideo } from './veo';
import { generateVoice } from './elevenlabs';
import { mergeAudioVideo } from './ffmpeg';
import { saveFinalVideo } from './storage';

export async function generatePipeline(projectId: string) {
  try {
    await updateProject(projectId, { status: 'script', progressStep: 'Gathering script data' });
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new Error("Project not found");
    
    let script;
    if (project.scriptJson) {
       script = JSON.parse(project.scriptJson);
    } else {
       const ideation = await generateIdeationPrompt(project.theme, 'product');
       script = await generateScriptPrompt(ideation);
    }

    await updateProject(projectId, { status: 'shots', progressStep: 'Generating product shots' });
    const shots = await generateProductShots(project.imageUrl, script.scenes, project.theme);

    await updateProject(projectId, { status: 'video', progressStep: 'Generating video' });
    const videoUrl = await generateVideo(shots, script.scenes);

    await updateProject(projectId, { status: 'audio', progressStep: 'Generating audio' });
    const narrationText = script.scenes.map((s: any) => s.narration).join(' ');
    const audioUrl = await generateVoice(narrationText, (project as any).voiceId);

    await updateProject(projectId, { status: 'finalizing', progressStep: 'Merging audio/video' });
    const finalVideo = await mergeAudioVideo(videoUrl, audioUrl);

    await saveFinalVideo(projectId, finalVideo.url);
    await updateProject(projectId, { status: 'done', progressStep: 'Done', videoUrl: finalVideo.url });
  } catch (e: any) {
    await updateProject(projectId, { status: 'error', error: e.message });
    console.error('Pipeline error:', e);
  }
}
