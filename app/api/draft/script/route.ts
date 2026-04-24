import { NextRequest, NextResponse } from 'next/server';
import { generateAdConcept } from '@/lib/ai';

function formatVisualPrompt(visualPrompt: unknown): string {
  if (!visualPrompt) return '';
  if (typeof visualPrompt === 'string') return visualPrompt;
  if (typeof visualPrompt !== 'object') return String(visualPrompt);

  const prompt = visualPrompt as {
    subject?: string;
    action?: string;
    cameraAngle?: string;
    lighting?: string;
    colorGrade?: string;
    doNotInclude?: string;
  };

  return [
    prompt.subject,
    prompt.action,
    prompt.cameraAngle,
    prompt.lighting,
    prompt.colorGrade,
    prompt.doNotInclude ? `AVOID: ${prompt.doNotInclude}` : null,
  ]
    .filter(Boolean)
    .join('. ');
}

export async function POST(req: NextRequest) {
  try {
    const {
      ideation,
      theme = 'general',
      brand = 'Brand',
      productDescription = 'Product',
      targetAudience = 'general audience',
    } = await req.json();
    if (!ideation) return NextResponse.json({ error: 'Missing ideation' }, { status: 400 });

    const result = await generateAdConcept(`${brand}: ${productDescription}`, theme, targetAudience);
    
    let scriptText = '';
    let dialogueText = '';
    
    result.scenes.forEach((scene, index) => {
      scriptText += `Scene ${index + 1}: ${scene.description}\nVisual: ${formatVisualPrompt(scene.visualPrompt)}\n\n`;
      if (scene.narration) {
        dialogueText += `${scene.narration}\n\n`;
      }
    });
    
    return NextResponse.json({
      script: scriptText.trim(),
      dialogue: dialogueText.trim(),
      rawJson: result // so we can save it to db later
    });
  } catch (e) {
    console.error('Draft Script Error:', e);
    return NextResponse.json({ error: 'Failed to generate script' }, { status: 500 });
  }
}
