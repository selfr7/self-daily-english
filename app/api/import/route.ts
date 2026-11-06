import { isSameOrigin } from '../../../lib/same-origin';
import { insertIfAbsent, getLessonRaw, swapLesson } from '../../../lib/db';
import { parseImport } from '../../import-normalize';
import { mergeLesson } from '../../../shared/practice-sheet.js';
import type { Lesson } from '../../cards';

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return new Response('Forbidden', { status: 403 });
  const raw = await req.text();
  if (raw.length > 8_000_000) return new Response('文件过大', { status: 413 });
  let body: { text?: unknown; topic?: unknown };
  try { body = JSON.parse(raw); } catch { return new Response('请求格式错误', { status: 400 }); }
  if (typeof body.text !== 'string' || !body.text.trim()) return new Response('没有可导入的内容', { status: 400 });

  const now = Date.now();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date(now));
  const { lessons, warnings } = parseImport(body.text, { today, now, topic: typeof body.topic === 'string' ? body.topic.trim() : '' });
  if (!lessons.length) return new Response(warnings[0] ?? '没有识别到可导入的学习记录', { status: 422 });

  let added = 0, skipped = 0, cards = 0, merged = 0;
  for (const lesson of lessons) {
    if (insertIfAbsent(lesson)) { added++; cards += lesson.cards.length; continue; }
    // 同一份练习单再导入：合并新卡片，已有卡片的复习进度不动
    const raw = lesson.id.startsWith('ps-') ? getLessonRaw(lesson.id) : undefined;
    if (raw) {
      const next = mergeLesson(JSON.parse(raw), lesson) as { lesson: Lesson; added: number };
      if (next.added && swapLesson(lesson.id, raw, next.lesson)) { merged++; cards += next.added; continue; }
    }
    skipped++;
  }
  return Response.json({ added, merged, skipped, cards, warnings: warnings.slice(0, 20) });
}
