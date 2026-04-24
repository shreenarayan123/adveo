import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const normalized = projects.map((p) => {
      let brand = 'Brand';
      let productDescription = 'Product';

      if (p.scriptJson) {
        try {
          const parsed = JSON.parse(p.scriptJson) as any;
          if (parsed?._meta?.brand) brand = parsed._meta.brand;
          if (parsed?._meta?.productDescription) productDescription = parsed._meta.productDescription;
        } catch {
          // Keep defaults when legacy scriptJson is not parseable.
        }
      }

      return {
        id: p.id,
        imageUrl: p.imageUrl,
        theme: p.theme,
        status: p.status,
        progressStep: p.progressStep,
        videoUrl: p.videoUrl,
        error: p.error,
        createdAt: p.createdAt,
        brand,
        productDescription,
      };
    });

    return NextResponse.json(normalized);
  } catch (e) {
    console.error('Projects API error:', e);
    return NextResponse.json([]);
  }
}
