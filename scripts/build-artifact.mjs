// 生成 Claude Artifact 页面：把 shared/practice-sheet.js 内联进 artifact/daily-english.src.html，
// 输出 artifact/daily-english.html（发布用的就是这个文件）。
// 用法：node scripts/build-artifact.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const src = readFileSync(new URL('artifact/daily-english.src.html', root), 'utf8');
const parser = readFileSync(new URL('shared/practice-sheet.js', root), 'utf8').replace(/^export\s+/gm, '');
if (!src.includes('/*@@PRACTICE_SHEET@@*/')) throw new Error('模板里找不到 /*@@PRACTICE_SHEET@@*/');
const out = src.replace('/*@@PRACTICE_SHEET@@*/', () => parser);
writeFileSync(new URL('artifact/daily-english.html', root), out);

// 语法检查：取出最后一个内联 <script>，交给 node 解析
const script = out.slice(out.lastIndexOf('<script>') + 8, out.lastIndexOf('</script>'));
new Function(script);
console.log(`built artifact/daily-english.html (${(out.length / 1024).toFixed(1)} KB), script parses`);
