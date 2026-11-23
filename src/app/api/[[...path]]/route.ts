import { handleApi } from '@/server/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function go(req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await ctx.params;
  return handleApi(req, path);
}

export const GET = go;
export const POST = go;
export const PATCH = go;
export const DELETE = go;
