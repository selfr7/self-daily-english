'use client';
// 句子拼写练习：中文在上，逐词输入英文。步骤由短到长，最后是整句；成分和词性用颜色标注。
// 逻辑（比对、评分、分组）在 shared/typing.js，和 Artifact 版共用；这里只负责界面。
import {useEffect,useReducer,useRef,type ChangeEvent,type KeyboardEvent} from 'react';
import {ROLE_ZH,buildSteps,gradeSentence,groupWords,makeWords,norm,patternOf,roleSegments,targetOf,wordsFor} from '../shared/typing.js';
import {playAgain,playGood,playSwoosh,playTap} from './sfx';
import type {CardEntry,ReviewRating} from './cards';

type Word={raw:string,roles:string[]|null,pos:string,norm:string,done:boolean,hinted:boolean};
type Step={en:string,zh?:string};
type Phase='typing'|'stepdone'|'result'|'done';
type Grade='perfect'|'good'|'again';
type Save='idle'|'saving'|'saved'|'failed';
type State={si:number,k:number,steps:Step[],words:Word[],wi:number,buffer:string,errors:number,hints:number,errAt:number,phase:Phase,combo:number,maxCombo:number,tally:Record<Grade,number>,skipped:number,grade:Grade|null,save:Save};
type Props={ids:string[],entryOf:(id:string)=>CardEntry|undefined,onReview:(entry:CardEntry,rating:ReviewRating,requestId:string)=>Promise<boolean>,onExit:()=>void};

function speak(text:string){
 if(typeof window==='undefined'||!('speechSynthesis' in window))return;
 const u=new SpeechSynthesisUtterance(text);u.lang='en-US';u.rate=.95;window.speechSynthesis.cancel();window.speechSynthesis.speak(u);
}
const stopSpeech=()=>{if(typeof window!=='undefined'&&'speechSynthesis' in window)window.speechSynthesis.cancel()};
const initial=():State=>({si:0,k:0,steps:[],words:[],wi:-1,buffer:'',errors:0,hints:0,errAt:-1,phase:'typing',combo:0,maxCombo:0,tally:{perfect:0,good:0,again:0},skipped:0,grade:null,save:'idle'});

export default function SentencePractice({ids,entryOf,onReview,onExit}:Props){
 const P=useRef<State>(initial()),input=useRef<HTMLInputElement>(null),root=useRef<HTMLDivElement>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null),errTimer=useRef<ReturnType<typeof setTimeout>|null>(null),request=useRef(''),exitRef=useRef<()=>void>(()=>{});
 const colorsRef=useRef(true),[,force]=useReducer((x:number)=>x+1,0);
 const s=P.current,n=ids.length;
 const entry=s.si<n?entryOf(ids[s.si]):undefined,card=entry?.card;
 const rerender=()=>force();

 function focusInput(){input.current?.focus({preventScroll:true})}
 function clearTimers(){if(timer.current)clearTimeout(timer.current);timer.current=null}
 function loadSentence(si:number){
  clearTimers();
  let i=si;while(i<n&&!entryOf(ids[i]))i++; // 卡片已不存在就跳过
  const e=i<n?entryOf(ids[i]):undefined;
  if(!e){P.current={...P.current,si:n,phase:'done'};stopSpeech();rerender();return}
  const steps=buildSteps(e.card) as Step[];
  P.current={...P.current,si:i,k:0,steps,errors:0,hints:0,grade:null,save:'idle'};
  request.current='';
  loadStep(e,0);
 }
 function loadStep(e:CardEntry,k:number){
  const st=P.current.steps[k],words=makeWords(e.card,st) as Word[];
  P.current={...P.current,k,words,wi:words.findIndex(w=>!w.done),buffer:'',errAt:-1,phase:'typing'};
  if(input.current)input.current.value='';
  rerender();
  if(!st.zh)speak(targetOf(st.en));
  if(P.current.wi<0)stepDone();
 }
 function stepDone(){
  const cur=P.current,e=entryOf(ids[cur.si]);if(!e)return;
  P.current={...cur,phase:'stepdone'};rerender();
  speak(targetOf(cur.steps[cur.k].en));
  const last=cur.k>=cur.steps.length-1;
  timer.current=setTimeout(()=>{if(last)sentenceDone();else loadStep(e,cur.k+1)},last?900:1100);
 }
 function sentenceDone(){
  const cur=P.current,e=entryOf(ids[cur.si]);if(!e)return;
  const grade=gradeSentence(cur.errors,cur.hints) as Grade,combo=grade==='perfect'?cur.combo+1:0;
  P.current={...cur,phase:'result',grade,combo,maxCombo:Math.max(cur.maxCombo,combo),tally:{...cur.tally,[grade]:cur.tally[grade]+1},save:'saving'};
  (grade==='again'?playAgain:playGood)();
  request.current=crypto.randomUUID();rerender();void save(e,grade);
 }
 async function save(e:CardEntry,grade:Grade){
  const id=request.current,at=P.current.si;let ok=false;
  try{ok=await onReview(e,grade==='again'?'again':'good',id)}catch{ok=false}
  if(P.current.si===at&&request.current===id){P.current={...P.current,save:ok?'saved':'failed'};rerender()}
 }
 function retrySave(){const e=entry,g=P.current.grade;if(!e||!g)return;P.current={...P.current,save:'saving'};rerender();void save(e,g)}
 function next(){if(P.current.phase==='result'&&P.current.save==='saving')return;stopSpeech();loadSentence(P.current.si+1)}
 function skip(){
  const cur=P.current;if(cur.phase!=='typing'&&cur.phase!=='stepdone')return;
  clearTimers();stopSpeech();playSwoosh(1);
  P.current={...cur,skipped:cur.skipped+1};loadSentence(cur.si+1); // 整句跳过：不记录成绩，也不影响连击
 }
 function advanceWord(){
  const cur=P.current,wi=cur.words.findIndex(w=>!w.done);
  P.current={...cur,wi,buffer:'',errAt:-1};if(input.current)input.current.value='';
  if(wi<0)stepDone();else rerender();
 }
 function submitWord(typed:string){
  const cur=P.current;if(cur.phase!=='typing'||cur.wi<0||!norm(typed))return;
  const w=cur.words[cur.wi];
  if(norm(typed)===w.norm){w.done=true;playTap();advanceWord();return}
  P.current={...cur,errors:cur.errors+1,errAt:cur.wi,buffer:''};if(input.current)input.current.value='';
  rerender();
  if(errTimer.current)clearTimeout(errTimer.current);
  errTimer.current=setTimeout(()=>{if(P.current.errAt>=0){P.current={...P.current,errAt:-1};rerender()}},450);
 }
 function hint(){
  const cur=P.current;if(cur.phase!=='typing'||cur.wi<0)return;
  const w=cur.words[cur.wi];w.done=true;w.hinted=true;P.current={...cur,hints:cur.hints+1};advanceWord();focusInput();
 }
 function listen(){const cur=P.current,st=cur.steps[cur.k];if(st)speak(targetOf(st.en));focusInput()}

 function onChange(ev:ChangeEvent<HTMLInputElement>){
  const cur=P.current,v=ev.target.value;
  if(cur.phase!=='typing'){ev.target.value='';return}
  if(/\s/.test(v)){
   // 一次输入了多个词（滑动输入、粘贴）：已完成的词依次提交，最后没敲完的留在输入框里
   const parts=v.split(/\s+/),rest=parts.pop()??'';
   ev.target.value='';P.current={...cur,buffer:''};
   let any=false;for(const t of parts)if(t){any=true;submitWord(t)}
   if(!any){rerender();return}
   const now=P.current;
   if(rest&&now.phase==='typing'&&now.wi>=0){ev.target.value=rest;P.current={...now,buffer:rest};if(norm(rest)===now.words[now.wi].norm){submitWord(rest);return}}
   rerender();return}
  P.current={...cur,buffer:v};
  if(norm(v)&&cur.words[cur.wi]&&norm(v)===cur.words[cur.wi].norm){submitWord(v);return} // 对了就直接进下一个词
  rerender();
 }
 function onKey(ev:KeyboardEvent<HTMLInputElement>){
  const cur=P.current;
  if(ev.key==='Tab'){ev.preventDefault();if(ev.shiftKey)skip();else hint()}
  else if(ev.key===' '&&(ev.ctrlKey||ev.metaKey)){ev.preventDefault();listen()}
  else if(ev.key==='Enter'){ev.preventDefault();if(cur.phase==='typing'&&cur.buffer){const t=cur.buffer;if(input.current)input.current.value='';P.current={...cur,buffer:''};submitWord(t)}else if(cur.phase==='result')next()}
 }

 useEffect(()=>{
  try{if(localStorage.getItem('typingColors')==='0'){colorsRef.current=false;rerender()}}catch{/* 忽略 */}
  const body=document.body,y=window.scrollY,prev={overflow:body.style.overflow,position:body.style.position,top:body.style.top,width:body.style.width};
  body.style.overflow='hidden';body.style.position='fixed';body.style.top=`-${y}px`;body.style.width='100%';
  const resize=()=>root.current?.style.setProperty('--player-height',`${window.visualViewport?.height??window.innerHeight}px`);
  resize();window.visualViewport?.addEventListener('resize',resize);
  const esc=(ev:globalThis.KeyboardEvent)=>{if(ev.key==='Escape'){ev.preventDefault();exitRef.current()}};
  window.addEventListener('keydown',esc);
  loadSentence(0);
  return()=>{window.removeEventListener('keydown',esc);window.visualViewport?.removeEventListener('resize',resize);Object.assign(body.style,prev);window.scrollTo(0,y);clearTimers();if(errTimer.current)clearTimeout(errTimer.current);stopSpeech()};
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 useEffect(()=>{if(s.phase!=='done')focusInput()},[s.phase,s.si,s.k]); // eslint-disable-line react-hooks/exhaustive-deps
 function toggleColors(){colorsRef.current=!colorsRef.current;try{localStorage.setItem('typingColors',colorsRef.current?'1':'0')}catch{/* 忽略 */}rerender()}
 function exit(){clearTimers();stopSpeech();onExit()}
 exitRef.current=exit;

 const colors=colorsRef.current,st=s.steps[s.k];
 const slots=s.words.map((w,i)=>{
  const cur=i===s.wi&&s.phase==='typing',role=w.roles?.find(Boolean)??null;
  const cls=['slot',role?'r'+role:w.pos?'pos':'',w.done?'done':'',cur?'cur':'',w.hinted?'hinted':'',i===s.errAt?'err':''].filter(Boolean).join(' ');
  const text=w.done?roleSegments(w.raw,w.roles).map((g:{r:string|null,text:string},j:number)=>g.r?<span key={j} className={`seg r${g.r}`}>{g.text}</span>:g.text):cur?<>{s.buffer}<i className="caret"/></>:null;
  return <span key={i} className={cls} style={{['--n' as string]:Math.max(1,w.raw.length)}}>{text}</span>;
 });
 const groups=(words:Word[])=>groupWords(words).map((g:{r:string|null,pos?:string,text:string,sp:boolean},i:number)=><span key={i} className={`grp${g.sp?' sp':''}${g.r?' r'+g.r:''}${g.pos?' pos':''}`}><span>{g.text}</span><small>{g.r?ROLE_ZH[g.r as keyof typeof ROLE_ZH]:g.pos||' '}</small></span>);
 const label={perfect:'完美',good:'不错',again:'再练'};
 const resultWords=card?(wordsFor(card,targetOf(card.en).split(/\s+/).filter(Boolean)) as Word[]):[];
 const pattern=card?.parts?.length?patternOf(card.parts):'';
 const total=s.tally.perfect+s.tally.good+s.tally.again;

 return <div ref={root} className={`typing-player${colors?' colors':''}`} role="dialog" aria-modal="true" aria-label="句子拼写练习">
  <header className="typing-head"><button onClick={exit} aria-label="返回">← 返回</button><div className="typing-title"><b>句子拼写</b><small>{s.phase==='done'?'完成':`${Math.min(s.si+1,n)} / ${n}`}</small></div><div className="typing-side">{s.combo>1&&<span className="combo">连击 ×{s.combo}</span>}<button className="colors-btn" aria-pressed={colors} onClick={toggleColors}><i/>颜色</button></div></header>
  <div className="typing-bar"><i style={{width:`${n?(Math.min(s.si,n)/n)*100:0}%`}}/></div>
  <div className="typing-stage" onClick={e=>{if(!(e.target as HTMLElement).closest('button'))focusInput()}}>
   {s.phase==='done'?<div className="typing-done"><b>{total}</b><p>本轮练了 {total} 个句子</p><div className="typing-tally"><span>完美 {s.tally.perfect}</span><span>不错 {s.tally.good}</span><span>再练 {s.tally.again}</span><span>最高连击 {s.maxCombo}</span>{s.skipped>0&&<span>跳过 {s.skipped}</span>}</div><button className="active" onClick={exit}>完成</button></div>
   :s.phase==='result'&&card?<div className="typing-result"><div className="full">{groups(resultWords)}</div><p className="r-zh">{card.zh}</p><p className="r-line">{[pattern,label[s.grade??'good'],s.errors?`${s.errors} 次拼错`:'没有拼错',s.hints?`${s.hints} 次提示`:'',s.grade==='again'?'明天再练':''].filter(Boolean).join(' · ')}</p>
     {s.save==='failed'&&<p role="alert" className="inline-error">成绩保存失败。<button className="linkish" onClick={retrySave}>重试</button></p>}
     <div className="typing-next"><button className="active" disabled={s.save==='saving'} onClick={next}>{s.save==='saving'?'正在保存…':'下一句'}</button><span className="note">或按 Enter</span></div></div>
   :<><p className="typing-zh">{!st?null:st.zh?st.zh:<span className="dict">听写 · 输入你听到的句子</span>}</p><div className={`slots${s.phase==='stepdone'?' grouped':''}`} aria-live="polite">{s.phase==='stepdone'?groups(s.words):slots}</div>
     <div className="typing-tools"><div className="typing-tools-row"><button className="linkish" onClick={hint}>提示</button><button className="linkish" onClick={listen}>朗读</button></div><button className="linkish skip" onClick={skip}>跳过</button></div></>}
  </div>
  <p className="typing-keys">空格 下一个词 · Enter 确认 · Tab 提示 · Shift+Tab 跳过 · Ctrl+空格 朗读 · Esc 退出</p>
  <input ref={input} className="typing-input" type="email" inputMode="email" autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="next" aria-label="输入英文" onChange={onChange} onKeyDown={onKey}/>
 </div>;
}
