// 通用导入：把各种形状的数据统一成 Lesson[]。
// 支持：
//  1. 本应用「导出全部数据」的 JSON（保留复习进度）
//  2. 单份学习记录 / 学习记录数组 / 外层包了一层 {lessons|records|data:[...]}
//  3. 只有卡片的数组：[{zh,en}] [{front,back}] [{question,answer}] [["中文","English"]] 等，可按卡片里的 date/topic 分组
//  4. JSON Lines（每行一个 JSON）
//  5. 纯文本：Tab / 竖线 | / 逗号 / CSV / Anki 导出 / "中文 English" 每行一张卡；可用 "日期: 2026-11-04"、"主题: xxx"、"# 标题" 分组
// 注意：本文件只能用 type import，这样 node 可以直接运行测试。
import { createHash } from 'node:crypto';
import type { Card, Lesson } from './cards';
import { parsePracticeSheet } from '../shared/practice-sheet.js';

export type ImportOptions = { today: string; now: number; topic?: string };
export type ImportResult = { lessons: Lesson[]; warnings: string[] };

type Obj = Record<string, unknown>;
type Ctx = { opts: ImportOptions; lessons: Lesson[]; warnings: string[]; seen: Set<string> };

const CJK = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/;
const LATIN = /[A-Za-z]/;
const hasCjk = (s: string) => CJK.test(s);
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

// 字段别名（比较时统一转小写）
const ZH_KEYS = ['zh', 'cn', 'chinese', '中文', 'question', 'q', 'front', 'prompt', 'meaning', 'translation', '题目', '问题', '正面'];
const EN_KEYS = ['en', 'english', '英文', 'answer', 'a', 'back', 'expression', 'text', 'word', 'phrase', '答案', '背面'];
const CARD_LIST_KEYS = ['cards', 'flashcards', 'expressions', 'items', 'entries', 'words', 'vocabulary', '卡片'];
const WRAPPER_KEYS = ['lessons', 'records', 'sessions', 'data', 'results', 'learning_records', '学习记录'];
const DATE_KEYS = ['date', 'day', '日期'];
const TOPIC_KEYS = ['topic', 'title', 'name', 'subject', 'deck', '主题', '标题'];
const TEXT_KEYS = ['paragraph', 'text', 'content', 'body', 'article', 'summary', '正文', '段落'];

function pick(o: Obj, keys: string[]): unknown {
  const lower = new Map(Object.keys(o).map((k) => [k.toLowerCase(), k]));
  for (const k of keys) {
    const real = lower.get(k.toLowerCase());
    if (real !== undefined && o[real] !== undefined && o[real] !== null && o[real] !== '') return o[real];
  }
  return undefined;
}
function pickStr(o: Obj, keys: string[]): string | undefined {
  const v = pick(o, keys);
  if (typeof v === 'string') return v.trim() || undefined;
  if (typeof v === 'number') return String(v);
  return undefined;
}
function pickList(o: Obj, keys: string[]): { key: string; list: unknown[] } | undefined {
  const lower = new Map(Object.keys(o).map((k) => [k.toLowerCase(), k]));
  for (const k of keys) {
    const real = lower.get(k.toLowerCase());
    if (real !== undefined && Array.isArray(o[real])) return { key: real, list: o[real] as unknown[] };
  }
  return undefined;
}

/** 把各种日期写法统一成 YYYY-MM-DD；认不出返回 undefined。 */
export function normalizeDate(v: unknown): string | undefined {
  let s: string | undefined;
  if (typeof v === 'number' && Number.isFinite(v)) {
    const ms = v < 1e11 ? v * 1000 : v;
    s = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date(ms));
  } else if (typeof v === 'string') s = v.trim();
  if (!s) return undefined;
  const m = s.match(/(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/) || s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return undefined;
  const iso = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  const d = new Date(iso + 'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : undefined;
}

function stripHtml(s: string) {
  return /<[a-z/][^>]*>/i.test(s) ? s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim() : s;
}

/** 让中文面在前（题目）、英文面在后（答案）。 */
function orient(a: string, b: string): [string, string] {
  return !hasCjk(a) && hasCjk(b) ? [b, a] : [a, b];
}

function makeCard(zh: string, en: string, ctx: Ctx, extra?: Obj): Card {
  const [z, e] = orient(zh.trim(), en.trim());
  const card: Card = {
    zh: z,
    en: e,
    due: Number.isFinite(extra?.due) ? (extra!.due as number) : ctx.opts.now,
    interval: Number.isFinite(extra?.interval) ? (extra!.interval as number) : 0,
  };
  if (extra) {
    if (isObj(extra.memory) && typeof extra.memory.dueAt === 'string') card.memory = extra.memory as Card['memory'];
    if (Array.isArray(extra.reviewHistory)) card.reviewHistory = extra.reviewHistory as Card['reviewHistory'];
    if (extra.scheduler === 'fsrs-6') card.scheduler = 'fsrs-6';
    if (extra.kind === 'correction' || extra.kind === 'vocab' || extra.kind === 'phrase' || extra.kind === 'collocation' || extra.kind === 'sentence') card.kind = extra.kind;
    if (typeof extra.said === 'string' && extra.said.trim()) card.said = extra.said.trim();
    if (typeof extra.note === 'string' && extra.note.trim()) card.note = extra.note.trim();
    if (Array.isArray(extra.steps)) {
      const steps = extra.steps.filter((s): s is { en: string; zh?: string } => isObj(s) && typeof s.en === 'string' && !!s.en.trim())
        .map((s) => (typeof s.zh === 'string' && s.zh.trim() ? { en: s.en.trim(), zh: s.zh.trim() } : { en: s.en.trim() }));
      if (steps.length) card.steps = steps;
    }
    if (Array.isArray(extra.parts)) {
      const parts = extra.parts.filter((p): p is { r: 'S' | 'V' | 'O' | 'C' | 'K' | 'A' | 'J'; t: string } =>
        isObj(p) && typeof p.t === 'string' && typeof p.r === 'string' && /^[SVOCKAJ]$/.test(p.r)).map((p) => ({ r: p.r, t: p.t }));
      if (parts.length) card.parts = parts;
    }
    if (Array.isArray(extra.pos)) {
      const pos = extra.pos.filter((p): p is { t: string; p: string } => isObj(p) && typeof p.t === 'string' && typeof p.p === 'string' && !!p.p)
        .map((p) => ({ t: p.t, p: p.p }));
      if (pos.length) card.pos = pos;
    }
  }
  return card;
}

/** 一张卡片的各种写法：数组 [中文, 英文]，或对象。认不出返回 null。 */
function normalizeCard(v: unknown, ctx: Ctx): Card | null {
  if (Array.isArray(v) && v.length >= 2 && typeof v[0] === 'string' && typeof v[1] === 'string' && v[0].trim() && v[1].trim()) {
    return makeCard(v[0], v[1], ctx);
  }
  if (!isObj(v)) return null;
  const zh = pickStr(v, ZH_KEYS), en = pickStr(v, EN_KEYS);
  if (!zh || !en) return null;
  return makeCard(zh, en, ctx, v);
}

function normalizeCards(list: unknown[], ctx: Ctx, where: string): Card[] {
  const cards: Card[] = [];
  let bad = 0;
  for (const item of list) {
    const c = normalizeCard(item, ctx);
    if (c) cards.push(c); else bad++;
  }
  if (bad) ctx.warnings.push(`${where}：有 ${bad} 条看不出中英文两面，已跳过`);
  return cards;
}

function cardsKey(cards: Card[]) {
  return cards.map((c) => c.zh + '\u0001' + c.en).join('\u0002');
}

function finishLesson(ctx: Ctx, base: Obj, cards: Card[], where: string) {
  if (!cards.length) { ctx.warnings.push(`${where}：没有可用的卡片，已跳过`); return; }
  const date = normalizeDate(base.date) ?? ctx.opts.today;
  const topic = (typeof base.topic === 'string' && base.topic.trim()) || ctx.opts.topic || '导入';
  const paragraph = typeof base.paragraph === 'string' ? base.paragraph : '';
  let id = typeof base.id === 'string' && base.id.trim() ? base.id.trim() : '';
  if (!id) id = 'imp-' + createHash('sha256').update(JSON.stringify([date, topic, cardsKey(cards)])).digest('hex').slice(0, 24);
  if (ctx.seen.has(id)) { ctx.warnings.push(`${where}：与本次导入里的另一份记录重复，已跳过`); return; }
  ctx.seen.add(id);
  const lesson: Obj = { ...base, id, date, topic, paragraph, cards };
  const grammar = Array.isArray(base.grammar) ? base.grammar.filter((g): g is string => typeof g === 'string' && !!g.trim()) : [];
  if (grammar.length) lesson.grammar = grammar; else delete lesson.grammar;
  const corrections = (Array.isArray(base.corrections) ? base.corrections : [])
    .filter((c): c is Obj => isObj(c) && typeof c.original === 'string' && typeof c.corrected === 'string')
    .map((c) => ({ original: c.original as string, corrected: c.corrected as string, ...(typeof c.explanation === 'string' ? { explanation: c.explanation } : {}) }));
  if (corrections.length) lesson.corrections = corrections; else delete lesson.corrections;
  if (lesson.vocabulary !== undefined && !Array.isArray(lesson.vocabulary)) delete lesson.vocabulary;
  ctx.lessons.push(lesson as unknown as Lesson);
}

function isWrapper(o: Obj) {
  const w = pickList(o, WRAPPER_KEYS);
  return !!w && w.list.some((x) => isObj(x) || Array.isArray(x));
}
function isLessonLike(o: Obj) {
  const l = pickList(o, CARD_LIST_KEYS);
  return !!l && l.list.length > 0;
}

function lessonFromObject(o: Obj, ctx: Ctx, where: string) {
  const found = pickList(o, CARD_LIST_KEYS)!;
  const base: Obj = { ...o };
  if (found.key !== 'cards') delete base[found.key];
  const alias = (to: string, keys: string[]) => {
    const v = to === 'date' ? pick(o, keys) : pickStr(o, keys);
    if (v !== undefined) base[to] = v;
  };
  alias('date', DATE_KEYS); alias('topic', TOPIC_KEYS); alias('paragraph', TEXT_KEYS);
  finishLesson(ctx, base, normalizeCards(found.list, ctx, where), where);
}

function fromValue(v: unknown, ctx: Ctx, where: string) {
  if (Array.isArray(v)) {
    const loose: unknown[] = [];
    v.forEach((el, i) => {
      if (isObj(el) && (isWrapper(el) || isLessonLike(el))) fromValue(el, ctx, `${where}第 ${i + 1} 项`);
      else loose.push(el);
    });
    if (loose.length) groupLooseCards(loose, ctx, where);
    return;
  }
  if (!isObj(v)) { ctx.warnings.push(`${where}：不是对象或数组`); return; }
  if (isWrapper(v)) { fromValue(pickList(v, WRAPPER_KEYS)!.list, ctx, where); return; }
  if (isLessonLike(v)) { lessonFromObject(v, ctx, where); return; }
  if (normalizeCard(v, ctx)) { groupLooseCards([v], ctx, where); return; }
  ctx.warnings.push(`${where}：没有找到卡片（需要 cards 数组，或每张卡有中文/英文两面）`);
}

/** 只有卡片没有记录外壳：按卡片自带的 date / topic 分组，没有就用今天和默认主题。 */
function groupLooseCards(list: unknown[], ctx: Ctx, where: string) {
  const groups = new Map<string, { date?: string; topic?: string; cards: Card[] }>();
  let bad = 0;
  for (const item of list) {
    const c = normalizeCard(item, ctx);
    if (!c) { bad++; continue; }
    const meta = isObj(item) ? item : {};
    const date = normalizeDate(pick(meta, DATE_KEYS)) ?? ctx.opts.today;
    const topic = pickStr(meta, TOPIC_KEYS) ?? ctx.opts.topic ?? '导入';
    const key = date + '|' + topic;
    if (!groups.has(key)) groups.set(key, { date, topic, cards: [] });
    groups.get(key)!.cards.push(c);
  }
  if (bad) ctx.warnings.push(`${where}：有 ${bad} 条看不出中英文两面，已跳过`);
  for (const g of groups.values()) finishLesson(ctx, { date: g.date, topic: g.topic }, g.cards, `${where}（${g.date} ${g.topic}）`);
}

// ---------- 纯文本 ----------

/** 解析一行 CSV（支持双引号和 "" 转义）。 */
function csvCells(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"' && cur === '') quoted = true;
    else if (ch === sep) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const HEADER_WORDS = new Set([...ZH_KEYS, ...EN_KEYS].map((k) => k.toLowerCase()));

/** 一行拆成 [面1, 面2]。拆不开返回 null。 */
function splitCardLine(raw: string): [string, string] | null {
  const line = stripHtml(raw.trim());
  // 1. 明确的分隔符：Tab、竖线、箭头——按第一个切开
  if (line.includes('\t')) {
    const cells = line.split('\t').map((c) => c.trim());
    if (cells[0] && cells[1]) return [cells[0], cells[1]];
  }
  for (const sep of ['|', '｜', '=>', '->', '→', '⇒']) {
    const i = line.indexOf(sep);
    if (i > 0) {
      const a = line.slice(0, i).trim(), b = line.slice(i + sep.length).trim();
      if (a && b) return [a, b];
    }
  }
  // 2. 带引号的 CSV
  if (line.includes('"')) {
    for (const sep of [',', ';']) {
      const cells = csvCells(line, sep).map((c) => c.trim());
      if (cells.length >= 2 && cells[0] && cells[1]) return [cells[0], cells[1]];
    }
  }
  // 3. 逗号、分号、破折号：只在「一边含汉字、另一边是纯外文」的位置切（避免切碎英文句子里的逗号）
  // 所有可能的切点里，选「中文那一边夹的英文字母最少」的（"I like it, a lot，我很喜欢" 应在中文逗号处切）
  let best: [string, string] | null = null, bestLatin = Infinity;
  for (const sep of [',', '，', ';', '；', ' - ', ' — ', ' – ', '：', ':']) {
    let from = 0;
    for (;;) {
      const i = line.indexOf(sep, from);
      if (i < 0) break;
      const a = line.slice(0, i).trim(), b = line.slice(i + sep.length).trim();
      if (a && b) {
        const aIsZh = hasCjk(a) && !hasCjk(b) && LATIN.test(b);
        const bIsZh = hasCjk(b) && !hasCjk(a) && LATIN.test(a);
        if (aIsZh || bIsZh) {
          const zhSide = aIsZh ? a : b;
          const latin = (zhSide.match(/[A-Za-z]/g) ?? []).length;
          if (latin < bestLatin) { best = [a, b]; bestLatin = latin; }
        }
      }
      from = i + sep.length;
    }
  }
  if (best) return best;
  // 4. 只用空格：必须是「汉字开头、外文结尾」或「外文开头、汉字结尾」
  const first = line.search(CJK);
  if (first < 0) return null;
  let last = -1;
  for (let i = line.length - 1; i >= 0; i--) if (CJK.test(line[i])) { last = i; break; }
  if (first === 0 && !CJK.test(line[line.length - 1])) {
    const a = line.slice(0, last + 1).trim(), b = line.slice(last + 1).replace(/^[\s,，;；:：.。、-]+/, '').trim();
    if (a && b && LATIN.test(b)) return [a, b];
  }
  if (first > 0 && CJK.test(line[line.length - 1])) {
    const a = line.slice(0, first).trim().replace(/[\s,，;；:：-]+$/, ''), b = line.slice(first).trim();
    if (a && b && LATIN.test(a)) return [a, b];
  }
  return null;
}

type Group = { date?: string; topic?: string; cards: Card[]; extra: string[] };

function fromText(text: string, ctx: Ctx) {
  const groups: Group[] = [];
  let cur: Group = { cards: [], extra: [] };
  const flush = () => { if (cur.cards.length) groups.push(cur); };
  const fresh = () => { flush(); cur = { cards: [], extra: [] }; };
  let skipped = 0;
  let headerChecked = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^#\s*\w+\s*:/.test(line) || line.startsWith('//')) continue; // Anki 文件头（#separator:tab 等）、注释
    const dateLine = line.match(/^(?:date|日期)\s*[:：]\s*(.+)$/i);
    if (dateLine) {
      if (cur.cards.length) fresh();
      const d = normalizeDate(dateLine[1]);
      if (d) cur.date = d; else ctx.warnings.push(`日期「${dateLine[1]}」认不出，已用今天`);
      continue;
    }
    const topicLine = line.match(/^(?:topic|title|主题|标题)\s*[:：]\s*(.+)$/i) || line.match(/^#{1,6}\s+(.+)$/);
    if (topicLine) {
      if (cur.cards.length) fresh();
      cur.topic = topicLine[1].trim();
      continue;
    }
    const pair = splitCardLine(line);
    if (pair) {
      if (!headerChecked) {
        headerChecked = true;
        if (HEADER_WORDS.has(pair[0].toLowerCase()) && HEADER_WORDS.has(pair[1].toLowerCase())) continue; // 表头行
      }
      cur.cards.push(makeCard(pair[0], pair[1], ctx));
      continue;
    }
    headerChecked = true;
    if (!hasCjk(line) && LATIN.test(line)) cur.extra.push(line); // 纯英文行当作正文
    else skipped++;
  }
  flush();

  if (skipped) ctx.warnings.push(`有 ${skipped} 行看不出中英文两面，已跳过`);
  groups.forEach((g, i) =>
    finishLesson(ctx, { date: g.date, topic: g.topic, paragraph: g.extra.join(' ') }, g.cards, groups.length > 1 ? `第 ${i + 1} 组` : '文本'),
  );
  if (!groups.length) ctx.warnings.push('没有识别到卡片。每行写一张：中文 + 英文，用 Tab、竖线 | 或逗号隔开都行');
}

// ---------- 入口 ----------

export function parseImport(input: string, opts: ImportOptions): ImportResult {
  const ctx: Ctx = { opts, lessons: [], warnings: [], seen: new Set() };
  const text = input.replace(/^\uFEFF/, '').trim();
  if (!text) return { lessons: [], warnings: ['内容是空的'] };

  // 练习单（#练习单 v1 或旧的「错误与正确表达」格式）：和 Claude Artifact 共用同一个解析器
  const sheet = parsePracticeSheet(text, { today: opts.today, now: opts.now }) as ImportResult | null;
  if (sheet) return sheet;

  if (text.startsWith('[') || text.startsWith('{')) {
    try {
      fromValue(JSON.parse(text), ctx, 'JSON');
    } catch {
      // 可能是 JSON Lines：每行一个 JSON
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      const parsed: unknown[] = [];
      let ok = lines.length > 1;
      for (const l of lines) {
        try { parsed.push(JSON.parse(l)); } catch { ok = false; break; }
      }
      if (ok) fromValue(parsed, ctx, 'JSONL');
      else ctx.warnings.unshift('看起来是 JSON，但格式不正确（检查逗号、引号、括号是否完整）');
    }
  } else {
    fromText(text, ctx);
  }
  return { lessons: ctx.lessons, warnings: ctx.warnings };
}
