import { NextRequest, NextResponse } from 'next/server';
import { generateScriptPrompt } from '@/lib/ai';

export async function POST(req: NextRequest) {
  try {
    const { ideation } = await req.json();
    if (!ideation) return NextResponse.json({ error: 'Missing ideation' }, { status: 400 });
    
    const result = await generateScriptPrompt({ idea: ideation });
    
    // Result is a ScriptV2 object
    // It contains .scenes[] (which has duration, description, visualPrompt, narration)
    // We will extract a textual representation for the UI textareas
    
    let scriptText = '';
    let dialogueText = '';
    
    result.scenes.forEach((scene, index) => {
      scriptText += `Scene ${index + 1}: ${scene.description}\nVisual: ${scene.visualPrompt}\n\n`;
      dialogueText += `${scene.narration}\n\n`;
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
