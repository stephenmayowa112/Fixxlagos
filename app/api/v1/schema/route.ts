import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function GET() {
  try {
    const specPath = path.join(process.cwd(), 'packages', 'api-client', 'openapi.yaml');
    const content = await fs.readFile(specPath, 'utf-8');
    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': 'application/yaml; charset=utf-8',
      },
    });
  } catch {
    return NextResponse.json(
      { error: { code: 'SCHEMA_NOT_FOUND', message: 'OpenAPI schema file missing' } },
      { status: 404 }
    );
  }
}
