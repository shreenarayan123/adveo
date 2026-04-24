import { NextRequest, NextResponse } from 'next/server';
import { generateIdeationPrompt } from '@/lib/ai';

export async function POST(req: NextRequest) {
  try {
    const { theme = 'general', brand = 'Brand', productDescription = 'Product' } = await req.json();
    const result = await generateIdeationPrompt(theme, `${brand}: ${productDescription}`);
    return NextResponse.json({
      idea: result.idea,
    });
  } catch (e) {
    console.error('Draft Ideation Error:', e);
    return NextResponse.json({ error: 'Failed to generate ideation' }, { status: 500 });
  }
}
