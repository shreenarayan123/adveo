import { NextRequest, NextResponse } from 'next/server';
import { generateIdeationPrompt } from '@/lib/ai';

export async function POST(req: NextRequest) {
  try {
    const { theme = 'general', productName = 'Product' } = await req.json();
    const result = await generateIdeationPrompt(theme, productName);
    return NextResponse.json(result);
  } catch (e) {
    console.error('Draft Ideation Error:', e);
    return NextResponse.json({ error: 'Failed to generate ideation' }, { status: 500 });
  }
}
