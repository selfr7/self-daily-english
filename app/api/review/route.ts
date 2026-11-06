import { isSameOrigin } from '../../../lib/same-origin';
import { getLessonRaw, swapLesson } from '../../../lib/db';
import { reviewCard } from '../../review-scheduler';
import type { Lesson } from '../../cards';

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return new Response('Forbidden', { status: 403 });
  const raw = await req.text();
  if (raw.length > 4096) return new Response('请求过长', { status: 413 });
  let input: any;
  try { input = JSON.parse(raw); } catch { return new Response('请求格式错误', { status: 400 }); }
  const { lessonId, index, rating, requestId, expectedDue, expectedReviews } = input ?? {};
  if (
    typeof lessonId !== 'string' || !Number.isInteger(index) || index < 0 ||
    !['again', 'good'].includes(rating) || typeof requestId !== 'string' || requestId.length < 1 || requestId.length > 200 ||
    !Number.isFinite(expectedDue) || !Number.isInteger(expectedReviews) || expectedReviews < 0
  ) return new Response('复习参数错误', { status: 400 });
  try {
    const stored = getLessonRaw(lessonId);
    if (!stored) return new Response('没有找到这张卡片', { status: 404 });
    const lesson = JSON.parse(stored) as Lesson;
    const card = lesson.cards[index];
    if (!card) return new Response('没有找到这张卡片', { status: 404 });
    if (card.reviewHistory?.some((e) => e.id === requestId)) return Response.json({ lesson });
    if (card.due !== expectedDue || (card.reviewHistory?.length ?? 0) !== expectedReviews)
      return new Response('这张卡片已在其他页面更新，请刷新后重试。', { status: 409 });
    lesson.cards[index] = await reviewCard(card, lessonId + '/' + index, rating, requestId, Date.now());
    if (!swapLesson(lessonId, stored, lesson)) return new Response('学习记录已更新，请刷新后重试。', { status: 409 });
    return Response.json({ lesson });
  } catch (e) {
    console.error('Review persistence failed', e);
    return new Response('复习进度保存失败，请重试。', { status: 500 });
  }
}
