'use client';
import {useEffect,useRef,useState} from 'react';
import {flushSync} from 'react-dom';
import {beginSpeech,type Recognition,type RecognitionConstructor} from './speech';
let speechBlockedForPage=false;
export default function SpokenAnswer({disabled}:{disabled:boolean}){
 const [answer,setAnswer]=useState(''),[listening,setListening]=useState(false),[supported,setSupported]=useState<boolean|null>(null),[message,setMessage]=useState(''),[expanded,setExpanded]=useState(false);
 const recognition=useRef<Recognition|null>(null),starting=useRef(false),field=useRef<HTMLTextAreaElement>(null);
 const dispose=()=>{const r=recognition.current;if(r){r.onresult=null;r.onend=null;r.onerror=null;r.abort();recognition.current=null}starting.current=false};
 useEffect(()=>{const w=window as Window&{SpeechRecognition?:RecognitionConstructor,webkitSpeechRecognition?:RecognitionConstructor};setSupported(!speechBlockedForPage&&!!(w.SpeechRecognition||w.webkitSpeechRecognition));return dispose},[]);
 useEffect(()=>{if(disabled){dispose();setListening(false)}},[disabled]);
 function typeAnswer(){dispose();setListening(false);flushSync(()=>setExpanded(true));field.current?.focus()}
 function recognitionError(message:string,code:string){
  setMessage(message);setListening(false);starting.current=false;
  if(['not-allowed','service-not-allowed','language-not-supported'].includes(code)){speechBlockedForPage=true;setSupported(false);dispose()}
 }
 function record(){
  if(listening){recognition.current?.stop();return}if(starting.current||disabled)return;
  const w=window as Window&{SpeechRecognition?:RecognitionConstructor,webkitSpeechRecognition?:RecognitionConstructor},Ctor=w.SpeechRecognition||w.webkitSpeechRecognition;
  if(!Ctor){setSupported(false);return}dispose();setMessage('');setExpanded(true);starting.current=true;setListening(true);
  try{recognition.current=beginSpeech(Ctor,{onText:setAnswer,onError:recognitionError,onEnd:()=>{starting.current=false;setListening(false)}})}catch(e){const code=e instanceof DOMException&&['NotAllowedError','SecurityError'].includes(e.name)?'not-allowed':'start-failed';recognitionError('语音识别未能启动，可以使用键盘听写或直接输入。',code)}
 }
 return <div className="spoken-answer"><div className="speech-toolbar"><button disabled={disabled} aria-pressed={listening} className={listening?'active':''} onClick={supported===false?typeAnswer:record}>{listening?'■ 结束录音':supported===false?'🎙 键盘听写':'🎙 语音作答'}</button><button disabled={listening} aria-expanded={expanded} onClick={()=>expanded?setExpanded(false):typeAnswer()}>{expanded?'收起回答':answer?'查看我的回答':'输入答案'}</button></div>{expanded&&<label className="spoken-field">你的回答<textarea ref={field} aria-label="你的英文回答" lang="en" rows={2} value={answer} readOnly={listening||disabled} onChange={e=>setAnswer(e.target.value)} placeholder="试着用英文说出来…"/></label>}{listening&&<small role="status">正在听，请说英文…</small>}{supported===false&&!disabled&&<small>点“键盘听写”，再点手机键盘上的麦克风，说英文即可；也可以直接输入。</small>}{message&&<p role="status" className="inline-error">{message}</p>}</div>;
}
