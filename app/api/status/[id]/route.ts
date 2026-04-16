import { NextRequest, NextResponse } from 'next/server';
import { getProjectStatus } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const status = await getProjectStatus(id);
    if (!status) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(status);
  } catch (e) {
    console.error('Status error:', e);
    return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 });
  }
}
