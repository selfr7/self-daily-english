export type SpeechResult={length:number,[index:number]:{0:{transcript:string},isFinal:boolean}};
export type Recognition={lang:string,continuous:boolean,interimResults:boolean,onresult:((e:{results:SpeechResult})=>void)|null,onerror:((e:{error:string})=>void)|null,onend:(()=>void)|null,start:()=>void,stop:()=>void,abort:()=>void};
export type RecognitionConstructor=new()=>Recognition;
export function recognitionText(results:SpeechResult){return Array.from({length:results.length},(_,i)=>results[i][0].transcript).join(' ').trim()}
export function speechError(code:string){return ({'not-allowed':'当前浏览器拒绝了语音输入，可能与权限或浏览器限制有关。请用键盘听写或直接输入。','service-not-allowed':'当前浏览器不允许语音识别，可以用系统键盘听写或直接输入。','audio-capture':'没有检测到可用的麦克风。','network':'语音识别连接失败，可以重试或直接输入。','no-speech':'没有听清，请再说一次。','language-not-supported':'当前浏览器不支持英文识别，可以直接输入。'} as Record<string,string>)[code]??'语音识别暂时不可用，可以重试或直接输入。'}
export function beginSpeech(Ctor:RecognitionConstructor,handlers:{onText:(text:string)=>void,onError:(message:string,code:string)=>void,onEnd:()=>void}){
 const recognition=new Ctor();recognition.lang='en-US';recognition.continuous=false;recognition.interimResults=true;
 recognition.onresult=e=>handlers.onText(recognitionText(e.results));recognition.onerror=e=>{if(e.error!=='aborted')handlers.onError(speechError(e.error),e.error)};recognition.onend=handlers.onEnd;
 recognition.start();return recognition;
}
