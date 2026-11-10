// 句子拼写练习的纯逻辑：本地 Next.js 应用和 Claude Artifact 共用同一份代码。
// 只做数据计算（词的比对、评分、步骤排序、句子成分/词性的分组），不碰 DOM、文件或数据库。
// 构建 artifact 时，scripts/build-artifact.mjs 会把本文件内联进页面（去掉 import / export），
// 所以这里只写顶层 function / const；normChars 来自 practice-sheet.js，artifact 里同在一个脚本中。
import { normChars } from './practice-sheet.js';

export const ROLE_ZH = { S: '主', V: '谓', O: '宾', C: '表', K: '补', A: '状', J: '连' };

// 撇号不算：所以 "im" 能对上 "I'm"（英文键盘的 ' 在第二页）
export const norm = (s) => String(s).toLowerCase().replace(/[’‘`´']/g, '').replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
export const targetOf = (en) => String(en).split(/\s+\/\s+/)[0].trim();

/* ---------- 句子结构：整句的每个字母按 card.parts / card.pos 得到一个成分或词性 ---------- */
function charsFrom(items, card) {
  if (!items?.length) return null;
  const out = [];
  for (const p of items) for (const ch of normChars(p.t)) out.push(p.v);
  return out.length === normChars(targetOf(card.en)).length ? out : null;
}
export const charRoles = (card) => charsFrom(card?.parts?.map((p) => ({ t: p.t, v: p.r })), card);
export const charPos = (card) => charsFrom(card?.pos?.map((p) => ({ t: p.t, v: p.p })), card);

// 一个片段（某一步或整句）里每个词对应的字母取值，在整句里定位
function pieceRoles(card, pieceTokens, roles = charRoles(card)) {
  if (!roles) return null;
  const toks = targetOf(card.en).split(/\s+/).filter(Boolean);
  const per = []; let k = 0;
  for (const t of toks) { const L = normChars(t).length; per.push(roles.slice(k, k + L)); k += L; }
  const want = pieceTokens.map(normChars), have = toks.map(normChars);
  for (let i = 0; i + want.length <= have.length; i++) {
    if (want.every((w, j) => w === have[i + j])) return per.slice(i, i + want.length);
  }
  return null;
}

/**
 * 一个片段的各个词。同时有主语和谓语的是分句 → 用句子成分；
 * 否则（比如 "two slices of bread" 这样的短语）→ 每个词用词性（练习单给了的话）。
 */
export function wordsFor(card, toks) {
  let roles = pieceRoles(card, toks), pos = null;
  if (roles) { const f = roles.flat(); if (!(f.includes('S') && f.includes('V'))) roles = null; }
  if (!roles) pos = pieceRoles(card, toks, charPos(card));
  return toks.map((raw, i) => ({ raw, roles: roles?.[i] ?? null, pos: pos?.[i]?.length ? [...new Set(pos[i])].join('·') : '' }));
}

/** 已完成的词按「同一成分连续一段」分组（词性则每个词一组），标签居中显示在各自下划线下面。 */
export function groupWords(words) {
  const groups = [];
  words.forEach((w, i) => {
    if (w.roles?.length) {
      let k = 0, cur = null, first = true;
      for (const ch of w.raw) {
        const r = normChars(ch) ? w.roles[Math.min(k++, w.roles.length - 1)] : (cur ?? w.roles[Math.min(k, w.roles.length - 1)]);
        const g = groups.at(-1);
        if (g && g.r && g.r === r) g.text += (first && i > 0 ? ' ' : '') + ch;
        else groups.push({ r, text: ch, sp: first && i > 0 });
        first = false; cur = r;
      }
    } else groups.push({ r: null, pos: w.pos, text: w.raw, sp: i > 0 });
  });
  return groups;
}

/** 一个完成的词按成分切成带颜色的小段（I'm = I + 'm）。 */
export function roleSegments(raw, roles) {
  if (!roles?.length) return [{ r: null, text: raw }];
  const out = []; let cur = null, buf = '', k = 0;
  const flush = () => { if (buf) out.push({ r: cur, text: buf }); buf = ''; };
  for (const ch of raw) {
    const r = normChars(ch) ? roles[Math.min(k++, roles.length - 1)] : cur;
    if (r !== cur) { flush(); cur = r; }
    buf += ch;
  }
  flush();
  return out;
}

/** 句型，比如「主谓宾 + 主系表」。 */
export function patternOf(parts) {
  const clauses = [[]];
  for (const p of parts) {
    if (p.r === 'J') { if (clauses.at(-1).length) clauses.push([]); continue; }
    if (p.r === 'A') continue;
    const c = clauses.at(-1);
    if (p.r === 'S' && c.includes('V')) { clauses.push([p.r]); continue; }
    if (p.r === 'V' && c.at(-1) === 'V') continue;
    c.push(p.r);
  }
  const NAME = { 'S V': '主谓', 'S V O': '主谓宾', 'S V C': '主系表', 'S V O O': '主谓双宾', 'S V O K': '主谓宾补' };
  return clauses.filter((c) => c.length).map((c) => NAME[c.join(' ')] ?? c.map((r) => ROLE_ZH[r]).join('')).join(' + ');
}

/* ---------- 练习流程 ---------- */

/** 一个句子的练习步骤：先是由短到长的拆分片段，最后是整句。 */
export function buildSteps(card) {
  const steps = (card.steps ?? []).filter((s) => norm(targetOf(s.en)) && targetOf(s.en).toLowerCase() !== targetOf(card.en).toLowerCase());
  return [...steps, { en: card.en, zh: card.zh }];
}

/** 某一步要输入的词。标点本身不用输入（done 直接为 true）。 */
export function makeWords(card, step) {
  const toks = targetOf(step.en).split(/\s+/).filter(Boolean);
  return wordsFor(card, toks).map((w) => ({ ...w, norm: norm(w.raw), done: !norm(w.raw), hinted: false }));
}

/** 整句的评价：没错没提示 perfect；没提示且错 ≤2 次 good；其余 again。 */
export function gradeSentence(errors, hints) {
  return errors + hints === 0 ? 'perfect' : hints === 0 && errors <= 2 ? 'good' : 'again';
}
