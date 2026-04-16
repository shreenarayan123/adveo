import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function GET(req: NextRequest) {
  try {
    const dbPath = path.resolve(process.cwd(), 'db.json');
    const data = await fs.readFile(dbPath, 'utf-8');
    return NextResponse.json(JSON.parse(data));
  } catch {
    return NextResponse.json([]);
  }
}
