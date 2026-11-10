'use client';
import {useEffect,useRef,useState,type KeyboardEvent} from 'react';
import SwipeFlash from './SwipeFlash';
import SpokenAnswer from './SpokenAnswer';
import SentencePractice from './SentencePractice';
import {playTap,playGood,playAgain} from './sfx';
import {allCards,filterCards,type Lesson,type CardEntry,type CardFilters,type ReviewRating} from './cards';
type Session={ids:string[],position:number,results:Record<string,ReviewRating>};
type View='setup'|'browse'|'practice'|'typing';
type Props={lessons:Lesson[],initialPractice?:boolean,initialTyping?:boolean,onReview:(entry:CardEntry,rating:ReviewRating,requestId:string)=>Promise<boolean>};
const emptyFilters:CardFilters={status:'all',date:'',topic:'',query:''};
export default function CardLibrary({lessons,initialPractice=false,initialTyping=false,onReview}:Props){
 const sentenceIds=(list:CardEntry[])=>list.filter(c=>c.card.kind==='sentence').sort((a,b)=>a.card.due-b.card.due).map(c=>c.id);
 const [now,setNow]=useState(()=>Date.now()),[filters,setFilters]=useState<CardFilters>({...emptyFilters,status:initialPractice?'due':'all'});
 const [view,setView]=useState<View>(initialTyping?'typing':initialPractice?'practice':'setup'),[typingIds,setTypingIds]=useState<string[]>(()=>initialTyping?sentenceIds(filterCards(allCards(lessons),{...emptyFilters,status:'due'},Date.now())):[]);
 const [session,setSession]=useState<Session|null>(()=>initialPractice?{ids:filterCards(allCards(lessons),{...emptyFilters,status:'due'},Date.now()).sort((a,b)=>a.card.due-b.card.due).map(c=>c.id),position:0,results:{}}:null);
 const [index,setIndex]=useState(0),[attempt,setAttempt]=useState(0),[flipped,setFlipped]=useState(false),[forgot,setForgot]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const lock=useRef(false),pending=useRef<{id:string,rating:ReviewRating}|null>(null),player=useRef<HTMLDivElement>(null),title=useRef<HTMLHeadingElement>(null),opener=useRef<HTMLButtonElement|null>(null);
 const [autoRead,setAutoRead]=useState(true);
 const active=view==='browse'||view==='practice';
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(timer)},[]);
 useEffect(()=>{
  if(!active)return;
  const body=document.body,y=window.scrollY,previous={overflow:body.style.overflow,position:body.style.position,top:body.style.top,width:body.style.width};
  body.style.overflow='hidden';body.style.position='fixed';body.style.top=`-${y}px`;body.style.width='100%';
  const resize=()=>{if(player.current)player.current.style.setProperty('--player-height',`${window.visualViewport?.height??window.innerHeight}px`)};
  resize();window.visualViewport?.addEventListener('resize',resize);title.current?.focus();
  return()=>{window.visualViewport?.removeEventListener('resize',resize);Object.assign(body.style,previous);window.scrollTo(0,y);opener.current?.focus()};
 },[active]);
 useEffect(()=>()=>{if('speechSynthesis' in window)window.speechSynthesis.cancel()},[]);
 useEffect(()=>{try{if(localStorage.getItem('autoRead')==='0')setAutoRead(false)}catch{/* 忽略 */}},[]);
 function toggleAutoRead(){setAutoRead(v=>{const next=!v;try{localStorage.setItem('autoRead',next?'1':'0')}catch{/* 忽略 */}if(!next&&'speechSynthesis' in window)window.speechSynthesis.cancel();return next})}
 const cards=allCards(lessons),matches=filterCards(cards,filters,now),dates=[...new Set(cards.map(c=>c.date))].sort().reverse(),topics=[...new Set(cards.map(c=>c.topic))];
 const browsePosition=matches.length?index%matches.length:0;
 const current=view==='practice'?cards.find(c=>c.id===session?.ids[session.position]):view==='browse'?matches[browsePosition]:undefined;
 const following=view==='practice'?cards.find(c=>c.id===session?.ids[session.position+1]):matches.length>1?matches[(browsePosition+1)%matches.length]:undefined;
 const result=current&&session?.results[current.id],completed=view==='practice'&&session&&session.position>=session.ids.length,reviewed=session?Object.keys(session.results).length:0;
 function resetFace(){setFlipped(false);setForgot(false);setError('');setNotice('');pending.current=null;setAttempt(a=>a+1);if('speechSynthesis' in window)window.speechSynthesis.cancel()}
 function changeFilter(next:Partial<CardFilters>){setFilters(f=>({...f,...next}));setIndex(0)}
 function startPractice(){if(lock.current||!matches.length)return;setSession({ids:[...matches].sort((a,b)=>a.card.due-b.card.due).map(c=>c.id),position:0,results:{}});setView('practice');resetFace()}
 function startBrowse(){if(lock.current||!matches.length)return;setIndex(0);setSession(null);setView('browse');resetFace()}
 function startTyping(){if(lock.current)return;const ids=sentenceIds(matches);if(!ids.length)return;setTypingIds(ids);setView('typing')}
 function exit(){if(lock.current)return;setView('setup');setSession(null);resetFace()}
 function move(step=1){if(lock.current)return;if(view==='practice'){setSession(s=>s?{...s,position:s.position+1}:s)}else if(matches.length){setIndex((browsePosition+step+matches.length)%matches.length)}resetFace()}
 async function rate(rating:ReviewRating,advance:boolean){
  if(!current||view!=='practice'||result||lock.current)return;
  lock.current=true;setSaving(true);setError('');if(!pending.current)(rating==='good'?playGood:playAgain)();const request=pending.current??{id:crypto.randomUUID(),rating};pending.current=request;
  try{if(!await onReview(current,request.rating,request.id)){setError('保存失败，请重试。不会重复记录。');return}
   pending.current=null;setSession(s=>s?{...s,results:{...s.results,[current.id]:request.rating},position:advance?s.position+1:s.position}:s);
   if(advance)resetFace();setNow(Date.now());
  }catch{setError('保存失败，请重试。不会重复记录。')}finally{lock.current=false;setSaving(false)}
 }
 function forget(){if(lock.current||pending.current)return;setFlipped(true);setForgot(true);if(view==='practice')void rate('again',false)}
 function speak(){if(!current)return;if(!('speechSynthesis' in window)){setNotice('当前浏览器不支持朗读。');return}window.speechSynthesis.cancel();const text=new SpeechSynthesisUtterance(current.card.en);text.lang='en-US';window.speechSynthesis.speak(text)}
 const currentId=current?.id;
 useEffect(()=>{if(flipped&&autoRead&&currentId)speak()},[flipped,autoRead,currentId]); // eslint-disable-line react-hooks/exhaustive-deps
 function dialogKey(e:KeyboardEvent<HTMLDivElement>){
  if(e.key==='Escape'){e.preventDefault();exit()}
  if(e.key==='Tab'&&player.current){const controls=Array.from(player.current.querySelectorAll<HTMLElement>('button:not(:disabled),textarea:not(:disabled),input:not(:disabled),[tabindex="0"]')).filter(el=>el.getClientRects().length);const first=controls[0],last=controls.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===title.current)){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}
 }
 if(view==='typing')return <SentencePractice ids={typingIds} entryOf={id=>cards.find(c=>c.id===id)} onReview={onReview} onExit={()=>setView('setup')}/>;
 if(view==='setup')return <div className="cards-setup"><div className="library-heading"><h2>卡片 <small>共 {cards.length} 张</small></h2><p>选好范围，再开始。</p></div>
  <div className="card-filters"><label>状态<select aria-label="筛选复习状态" value={filters.status} onChange={e=>changeFilter({status:e.target.value as CardFilters['status']})}><option value="all">全部卡片</option><option value="due">待复习</option><option value="again">还不会</option><option value="good">记住了</option></select></label><label>学习日期<select aria-label="筛选学习日期" value={filters.date} onChange={e=>changeFilter({date:e.target.value})}><option value="">全部日期</option>{dates.map(date=><option key={date}>{date}</option>)}</select></label><label>主题<select aria-label="筛选主题" value={filters.topic} onChange={e=>changeFilter({topic:e.target.value})}><option value="">全部主题</option>{topics.map(topic=><option key={topic}>{topic}</option>)}</select></label></div>
  <input aria-label="搜索卡片" placeholder="搜索中文、英文或关键词" value={filters.query} onChange={e=>changeFilter({query:e.target.value})}/>
  <div className="selection-summary"><strong>{matches.length} 张卡片</strong><small>{matches.length?'浏览随便翻，练习会记录记忆情况。':cards.length?'换个筛选条件试试。':'保存练习记录后，卡片会出现在这里。'}</small></div>
  <div className="setup-actions"><button disabled={!matches.length} onClick={e=>{opener.current=e.currentTarget;startBrowse()}}>自由浏览</button><button className="active" disabled={!matches.length} onClick={e=>{opener.current=e.currentTarget;startPractice()}}>开始练习 →</button></div><div className="setup-actions typing-entry"><button disabled={!matches.some(c=>c.card.kind==='sentence')} onClick={startTyping}>句子拼写 · {matches.filter(c=>c.card.kind==='sentence').length} 句</button></div>{cards.length>0&&!matches.length&&<button className="reset-filters" onClick={()=>setFilters(emptyFilters)}>清除筛选，查看全部</button>}
 </div>;
 return <div ref={player} className="card-player" role="dialog" aria-modal="true" aria-labelledby="player-title" onKeyDown={dialogKey}>
  <div className="player-shell"><header className="player-header"><button disabled={saving} onClick={exit} aria-label="返回选择范围">← 返回</button><h2 id="player-title" ref={title} tabIndex={-1}>{view==='practice'?'练习':'自由浏览'}</h2><span aria-live="polite">{current?`${view==='practice'?(session?.position??0)+1:browsePosition+1} / ${view==='practice'?session?.ids.length:matches.length}`:'完成'}</span></header>
  {completed?<><div className="player-content session-complete"><small>PRACTICE COMPLETE</small><h2>{session.ids.length?'这一轮练完了':'暂时没有待复习卡片'}</h2><p>{session.ids.length?`看过 ${session.ids.length} 张 · 已评价 ${reviewed} 张`:'返回后可以选其他日期或主题。'}</p></div><footer className="player-actions"><button className="active" onClick={exit}>返回选择范围</button></footer></>:current?<>
   <div className="player-content"><div className="player-meta"><small>{current.topic} · {current.date}</small><span className="read-tools"><button className="read-answer" aria-pressed={autoRead} onClick={toggleAutoRead}>{autoRead?'自动朗读：开':'自动朗读：关'}</button>{flipped&&<button className="read-answer" disabled={saving} onClick={speak}>▷ 朗读</button>}</span></div>
    <SwipeFlash key={'card/'+current.id+'/'+attempt} front={current.card.zh} back={current.card.en} nextFront={following?.card.zh} flipped={flipped} busy={saving} mode={view==='browse'?'browse':'review'} onFlip={()=>{if(!pending.current){playTap();setFlipped(f=>!f)}}} onNext={async()=>move()}/>
    {view==='practice'&&<SpokenAnswer key={'answer/'+current.id+'/'+attempt} disabled={flipped||saving}/>}
    {result&&<p className="player-feedback" role="status">已记为{result==='again'?'“没想起来”':'“想起来了”'} · {new Date(current.card.due).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})} 再练</p>}
    {error&&<p role="alert" className="inline-error">{error}</p>}{notice&&<p role="status" className="player-feedback">{notice}</p>}
   </div>
   <footer className="player-actions">
    {view==='browse'?<div className="player-buttons"><button disabled={saving||matches.length<2} onClick={()=>move(-1)}>← 上一张</button><button className="active" onClick={()=>{playTap();setFlipped(f=>!f)}}>{flipped?'看题目':'看答案'}</button><button disabled={saving||matches.length<2} onClick={()=>move()}>下一张 →</button></div>:!flipped?<><div className="player-buttons"><button disabled={saving} onClick={forget}>忘记了</button><button disabled={saving} className="active" onClick={()=>{playTap();setFlipped(true)}}>对照答案</button></div><button className="skip-card" disabled={saving} onClick={()=>move()}>跳过，不记录 →</button></>:result?<button disabled={saving} className="active" onClick={()=>move()}>下一张 →</button>:error?<button disabled={saving} className="active" onClick={()=>void rate(pending.current?.rating??'again',!forgot)}>重试保存</button>:forgot?<button disabled>正在保存…</button>:<div className="player-buttons"><button disabled={saving} onClick={()=>void rate('again',true)}>还不会</button><button disabled={saving} className="active" onClick={()=>void rate('good',true)}>想起来了</button></div>}
    <small>{view==='browse'?'左右滑动换卡，不影响复习进度。':flipped?'表达出意思即可，不必逐字相同。':'先独立回想，再对照答案。'}</small>
   </footer>
  </>:<><div className="player-content session-complete"><h2>没有可浏览的卡片</h2></div><footer className="player-actions"><button onClick={exit}>返回选择范围</button></footer></>}
  </div>
 </div>;
}
