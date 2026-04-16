import { prisma } from './prisma';
import { generatePipeline } from './pipeline';

type ProjectStatus = 'processing' | 'script' | 'shots' | 'video' | 'audio' | 'finalizing' | 'done' | 'error';

export interface Project {
  id: string;
  imageUrl: string;
  theme: string;
  status: ProjectStatus;
  progressStep: string;
  videoUrl?: string | null;
  error?: string | null;
  scriptJson?: string | null;
  voiceId?: string | null;
}

export async function createProject({ imageUrl, theme, scriptJson, voiceId }: { imageUrl: string; theme: string; scriptJson?: string; voiceId?: string; }) {
  const project = await prisma.project.create({
    data: {
      imageUrl,
      theme,
      scriptJson,
      voiceId,
      status: 'processing',
      progressStep: 'init',
    } as any
  });
  return project;
}

export async function updateProject(id: string, data: Partial<Project>) {
  await prisma.project.update({
    where: { id },
    data
  });
}

export async function getProjectStatus(id: string) {
  const project = await prisma.project.findUnique({
    where: { id }
  });
  if (!project) return null;
  return {
    status: project.status,
    progressStep: project.progressStep,
    videoUrl: project.videoUrl,
    error: project.error,
  };
}

export async function startPipeline(projectId: string) {
  generatePipeline(projectId).catch(e => {
    updateProject(projectId, { status: 'error', error: e.message });
    console.error('Pipeline error:', e);
  });
}
