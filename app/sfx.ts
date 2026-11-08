let ctx:AudioContext|null=null;
function context(){
 if(typeof window==='undefined')return null;
 if(!ctx){const Ctor=window.AudioContext??(window as unknown as {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;if(!Ctor)return null;try{ctx=new Ctor()}catch{return null}}
 return ctx;
}
/** 在用户手势中调用,解除浏览器自动播放限制。 */
export function unlockAudio(){const c=context();if(c&&c.state==='suspended')void c.resume().catch(()=>{})}
function tone(notes:{f:number,at:number,dur:number,vol?:number,type?:OscillatorType}[]){
 const c=context();if(!c)return;
 try{
  if(c.state==='suspended')void c.resume().catch(()=>{});
  const t=c.currentTime;
  for(const n of notes){
   const osc=c.createOscillator(),gain=c.createGain(),s=t+n.at;
   osc.type=n.type??'sine';osc.frequency.setValueAtTime(n.f,s);
   gain.gain.setValueAtTime(.0001,s);gain.gain.exponentialRampToValueAtTime(n.vol??.12,s+.01);gain.gain.exponentialRampToValueAtTime(.0001,s+n.dur);
   osc.connect(gain);gain.connect(c.destination);osc.start(s);osc.stop(s+n.dur+.02);
  }
 }catch{/* 音效失败不影响使用 */}
}
/** 点击翻面:轻轻的一声"嗒"。 */
export function playTap(){tone([{f:880,at:0,dur:.06,vol:.08,type:'triangle'}])}
/** 想起来了:上扬的两音。 */
export function playGood(){tone([{f:660,at:0,dur:.14},{f:990,at:.09,dur:.22}])}
/** 忘了 / 还不会:低沉下行的两音。 */
export function playAgain(){tone([{f:330,at:0,dur:.14,type:'triangle'},{f:247,at:.1,dur:.24,type:'triangle'}])}
/** 划走卡片的短促"嗖"声:带通滤波噪声 + 频率扫描。 */
export function playSwoosh(direction=1){
 const c=context();if(!c)return;
 try{
  if(c.state==='suspended')void c.resume().catch(()=>{});
  const dur=.22,len=Math.floor(c.sampleRate*dur),buffer=c.createBuffer(1,len,c.sampleRate),data=buffer.getChannelData(0);
  for(let i=0;i<len;i++)data[i]=Math.random()*2-1;
  const src=c.createBufferSource();src.buffer=buffer;
  const filter=c.createBiquadFilter();filter.type='bandpass';filter.Q.value=1.2;
  const t=c.currentTime;
  filter.frequency.setValueAtTime(direction>0?500:2400,t);filter.frequency.exponentialRampToValueAtTime(direction>0?2400:500,t+dur);
  const gain=c.createGain();
  gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(.16,t+.05);gain.gain.exponentialRampToValueAtTime(.0001,t+dur);
  src.connect(filter);filter.connect(gain);gain.connect(c.destination);
  src.start(t);src.stop(t+dur);
 }catch{/* 音效失败不影响使用 */}
}
