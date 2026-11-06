import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),cache=new Map();
function load(file){if(cache.has(file))return cache.get(file).exports;const module={exports:{}};cache.set(file,module);const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;new Function('require','module','exports',code)(name=>name.startsWith('.')?load(path.resolve(path.dirname(file),name+(name.endsWith('.ts')?'':name.endsWith('cards')||name.endsWith('speech')||name.endsWith('swipe-gesture')?'.ts':'.tsx'))):require(name),module,module.exports);return module.exports;}
const CardLibrary=load(path.resolve('app/CardLibrary.tsx')).default;
const lessons=[{id:'test',topic:'Coffee',date:'2026-11-04',paragraph:'Test',cards:[{zh:'测试卡片内容',en:'Test card content',due:0,interval:0}]}];
const setup=renderToStaticMarkup(React.createElement(CardLibrary,{lessons,onReview:async()=>true}));
assert.ok(setup.includes('开始练习'));assert.ok(setup.includes('筛选复习状态'));assert.ok(!setup.includes('测试卡片内容'));assert.ok(!setup.includes('swipe-flash'));assert.ok(!setup.includes('语音作答'));
const practice=renderToStaticMarkup(React.createElement(CardLibrary,{lessons,initialPractice:true,onReview:async()=>true}));
assert.ok(practice.includes('role="dialog"'));assert.ok(practice.includes('aria-modal="true"'));assert.ok(practice.includes('测试卡片内容'));assert.ok(practice.includes('忘记了'));assert.ok(practice.includes('对照答案'));assert.ok(practice.includes('语音作答'));assert.ok(!practice.includes('筛选复习状态'));assert.ok(!practice.includes('<textarea'));assert.ok(!practice.includes('reference-answer'));
console.log('PASS: range selection renders no card; quick practice renders a separate dialog without filters, duplicated answers or an expanded keyboard field');
