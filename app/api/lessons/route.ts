import { isSameOrigin } from '../../../lib/same-origin';
import { listLessons, upsertLesson } from '../../../lib/db';
import type { Lesson } from '../../cards';

export async function GET() {
  return Response.json(listLessons());
}

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return new Response('Forbidden', { status: 403 });
  const raw = await req.text();
  if (raw.length > 500000) return new Response('内容过长', { status: 413 });
  try {
    const d = JSON.parse(raw);
    const bad =
      typeof d.id !== 'string' || typeof d.topic !== 'string' || typeof d.date !== 'string' ||
      typeof d.paragraph !== 'string' || !Array.isArray(d.cards) ||
      d.cards.some((c: any) => typeof c.zh !== 'string' || typeof c.en !== 'string' || !Number.isFinite(c.due) || !Number.isFinite(c.interval));
    if (bad) return new Response('记录格式错误', { status: 400 });
    upsertLesson(d as Lesson);
    return Response.json({ saved: true });
  } catch {
    return new Response('保存失败，请检查格式后重试', { status: 400 });
  }
}
