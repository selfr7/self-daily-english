import assert from 'node:assert/strict';
import {parseImport} from '../app/import-normalize.ts';
const now=Date.parse('2026-11-04T12:00:00Z'),opts={today:'2026-11-04',now,topic:''};
const run=(t,o={})=>parseImport(t,{...opts,...o});

// 1. 本应用导出的完整数据：保留 id 和复习进度
const full=[{id:'chat-abc',date:'2026-11-03',topic:'Coffee',paragraph:'I like coffee.',grammar:['a','',3],corrections:[{original:'x',corrected:'y'},{bad:1}],vocabulary:[{en:'latte',zh:'拿铁'}],
  cards:[{zh:'拿铁',en:'Latte',due:12345,interval:2.5,scheduler:'fsrs-6',memory:{dueAt:'2026-11-05T00:00:00.000Z',lastReviewAt:null},reviewHistory:[{id:'r1',at:1,rating:'good',due:12345}]}]}];
let r=run(JSON.stringify(full));
assert.equal(r.lessons.length,1);assert.equal(r.lessons[0].id,'chat-abc');assert.equal(r.lessons[0].date,'2026-11-03');
assert.equal(r.lessons[0].cards[0].due,12345);assert.equal(r.lessons[0].cards[0].reviewHistory.length,1);assert.equal(r.lessons[0].cards[0].memory.dueAt,'2026-11-05T00:00:00.000Z');
assert.deepEqual(r.lessons[0].grammar,['a']);assert.equal(r.lessons[0].corrections.length,1);assert.equal(r.lessons[0].vocabulary[0].en,'latte');

// 2. 单份记录，字段别名，日期写法
r=run(JSON.stringify({日期:'2026/11/4',title:'Travel',text:'Hello.',flashcards:[{front:'你好',back:'Hello'},{question:'再见',answer:'Bye'}]}));
assert.equal(r.lessons[0].date,'2026-11-04');assert.equal(r.lessons[0].topic,'Travel');assert.equal(r.lessons[0].paragraph,'Hello.');assert.equal(r.lessons[0].cards.length,2);assert.equal(r.lessons[0].cards[0].due,now);

// 3. 外层包装 + 卡片数组格式 + 正反面写反会自动调正
r=run(JSON.stringify({records:[{date:'2026-11-01',topic:'A',cards:[['苹果','Apple'],['Banana','香蕉']]}]}));
assert.equal(r.lessons[0].cards[1].zh,'香蕉');assert.equal(r.lessons[0].cards[1].en,'Banana');

// 4. 只有卡片，按自带 date/topic 分组
r=run(JSON.stringify([{zh:'一',en:'one',date:'2026-10-01',topic:'N'},{zh:'二',en:'two',date:'2026-10-01',topic:'N'},{zh:'三',en:'three'}]));
assert.equal(r.lessons.length,2);assert.equal(r.lessons.find(l=>l.date==='2026-10-01').cards.length,2);assert.equal(r.lessons.find(l=>l.date==='2026-11-04').topic,'导入');

// 5. 重复导入同样内容：id 稳定，便于跳过
const a=run(JSON.stringify([{zh:'一',en:'one'}])),b=run(JSON.stringify([{zh:'一',en:'one'}]),{now:now+999});assert.equal(a.lessons[0].id,b.lessons[0].id);

// 6. JSON Lines
r=run('{"zh":"猫","en":"cat"}\n{"zh":"狗","en":"dog"}');assert.equal(r.lessons[0].cards.length,2);

// 7. 纯文本：Tab / 竖线 / 逗号 / 空格 / 反写，一份里混着也行
r=run('日期: 2026-11-02\n主题: 咖啡\n拿铁\tLatte\n奶香口感 | Milky taste\nI like coffee, a lot，我很喜欢咖啡\n我喜欢咖啡, I like coffee, very much\n让我清醒 Wake me up\nWake up early 早起\n');
assert.equal(r.lessons.length,1);assert.equal(r.lessons[0].date,'2026-11-02');assert.equal(r.lessons[0].topic,'咖啡');
const t=r.lessons[0].cards.map(c=>c.zh+'='+c.en);
assert.deepEqual(t,['拿铁=Latte','奶香口感=Milky taste','我很喜欢咖啡=I like coffee, a lot','我喜欢咖啡=I like coffee, very much','让我清醒=Wake me up','早起=Wake up early']);

// 8. CSV（带表头和引号）、Anki（文件头、HTML）
r=run('zh,en\n"你好, 朋友","Hello, friend"\n再见,Goodbye');
assert.equal(r.lessons[0].cards.length,2);assert.equal(r.lessons[0].cards[0].zh,'你好, 朋友');assert.equal(r.lessons[0].cards[0].en,'Hello, friend');
r=run('#separator:tab\n#html:true\n猫<br>(名词)\tcat<div>animal</div>\ttag1');
assert.equal(r.lessons[0].cards[0].zh,'猫 (名词)');assert.equal(r.lessons[0].cards[0].en,'catanimal');

// 9. Markdown 标题分多份
r=run('# 咖啡\n拿铁|Latte\n# 旅行\n机场|Airport');
assert.equal(r.lessons.length,2);assert.equal(r.lessons[1].topic,'旅行');

// 10. 纯英文行当正文；认不出的行给出提示，不崩
r=run('# T\nI like coffee every day.\n拿铁|Latte\n??? 乱七八糟的一行');
assert.equal(r.lessons[0].paragraph,'I like coffee every day.');assert.ok(r.warnings.some(w=>w.includes('1 行')));

// 11. 出错的输入给出可读提示
assert.equal(run('').lessons.length,0);assert.ok(run('{"a":').warnings[0].includes('JSON'));assert.equal(run('{"hello":1}').lessons.length,0);assert.equal(run('随便写点什么').lessons.length,0);
// 12. 默认主题与不可能的日期
r=run('拿铁|Latte',{topic:'我的词表'});assert.equal(r.lessons[0].topic,'我的词表');
r=run(JSON.stringify({date:'2026-02-30',cards:[{zh:'一',en:'one'}]}));assert.equal(r.lessons[0].date,'2026-11-04');
console.log('PASS: full export keeps progress, aliases, wrappers, loose-card grouping, JSONL, text/CSV/Anki/markdown, stable ids, bad input');
