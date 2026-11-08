'use client';
import {useEffect,useRef,useState} from 'react';
import {isMasteredSwipe} from './swipe-gesture';
import {playSwoosh,unlockAudio} from './sfx';
type Props={front:string,back:string,flipped:boolean,busy:boolean,onFlip:()=>void,nextFront?:string,mode?:'review'|'browse',onNext:()=>Promise<void>};
type Gesture={x:number,y:number,id:number,axis:'pending'|'horizontal'};
export default function SwipeFlash({front,back,flipped,busy,nextFront,mode='review',onFlip,onNext}:Props){
 const card=useRef<HTMLButtonElement>(null),start=useRef<Gesture|null>(null),moved=useRef(false),locked=useRef(false),animation=useRef<Animation|null>(null);
 const [dragging,setDragging]=useState(false),[exiting,setExiting]=useState(false),[ready,setReady]=useState(false);
 useEffect(()=>()=>{animation.current?.cancel()},[]);
 const reset=()=>{if(card.current)card.current.style.transform='';setDragging(false);setReady(false)};
 const cancel=()=>{if(!start.current)return;start.current=null;moved.current=true;reset()};
 async function finish(e:React.PointerEvent<HTMLButtonElement>){
  const s=start.current;if(!s||s.id!==e.pointerId)return;start.current=null;
  const dx=e.clientX-s.x,dy=e.clientY-s.y;
  if(s.axis!=='horizontal'||!isMasteredSwipe(dx,dy)){reset();return}
  moved.current=true;locked.current=true;setDragging(false);setExiting(true);setReady(false);
  if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches)playSwoosh(Math.sign(dx));
  const el=e.currentTarget,direction=Math.sign(dx);
  const distance=Math.max(window.innerWidth,el.getBoundingClientRect().width)*1.15;
  const motion=el.animate([{transform:el.style.transform||'none'},{transform:`translate3d(${direction*distance*.42}px,-60px,0) rotate(${direction*22}deg)`,offset:.55},{transform:`translate3d(${direction*distance}px,-150px,0) rotate(${direction*38}deg)`}],{duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches?1:360,easing:'cubic-bezier(.28,.55,.45,1)',fill:'forwards'});
  animation.current=motion;
  try{await motion.finished;if(el.isConnected)await onNext()}catch{/* Cancellation on unmount is expected. */}finally{motion.cancel();animation.current=null;locked.current=false;if(el.isConnected){setExiting(false);reset()}}
 }
 return <div className="flash-wrap"><div className={`flash-deck${dragging||exiting?' lifted':''}`}><div className="deck-card deck-bottom" aria-hidden="true"/><div className="deck-card deck-next" aria-hidden="true">{nextFront&&<span>{nextFront}<small>点击查看答案</small></span>}</div><button ref={card} className={`flash swipe-flash${dragging?' dragging':''}${exiting?' exiting':''}`} disabled={busy||exiting} aria-label={`${flipped?'英文答案，点击返回题目':'中文题目，点击查看答案'}；左右滑动查看下一张`}
 onPointerDown={e=>{if(busy||locked.current||!e.isPrimary||e.button!==0)return;unlockAudio();start.current={x:e.clientX,y:e.clientY,id:e.pointerId,axis:'pending'};moved.current=false;e.currentTarget.setPointerCapture(e.pointerId)}}
 onPointerMove={e=>{const s=start.current;if(!s||s.id!==e.pointerId)return;const dx=e.clientX-s.x,dy=e.clientY-s.y;if(s.axis==='pending'){if(Math.max(Math.abs(dx),Math.abs(dy))<4)return;moved.current=true;if(Math.abs(dy)>Math.abs(dx)){cancel();return}s.axis='horizontal';setDragging(true)}e.currentTarget.style.transform=`translate3d(${dx}px,${-Math.min(42,Math.abs(dx)*.18)}px,0) rotate(${Math.max(-20,Math.min(20,dx/9))}deg)`;setReady(isMasteredSwipe(dx,dy))}}
 onPointerCancel={cancel} onLostPointerCapture={cancel} onPointerUp={finish} onDragStart={e=>e.preventDefault()} onContextMenu={e=>e.preventDefault()}
 onClick={e=>{if(e.detail>0&&moved.current){moved.current=false;return}if(!busy&&!locked.current)onFlip()}}><span className="flash-content">{flipped?back:front}<small>{flipped?'参考答案 · 点击看题目':'点击查看答案'}</small></span><span className={`swipe-feedback${ready?' visible':''}`} aria-hidden="true">松开查看下一张</span></button></div><p className="swipe-hint" aria-live="polite">{busy?'正在保存复习进度…':mode==='browse'?'左右滑动：下一张 · 浏览不影响复习进度':'左右滑动可跳过 · 只有明确评价才记录进度'}</p></div>
}
