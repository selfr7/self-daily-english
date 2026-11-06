export type ReviewRating='again'|'good';
export type ReviewEvent={id:string,at:number,rating:ReviewRating,due:number,log?:unknown};
export type StoredMemory={dueAt:string,lastReviewAt:string|null,[key:string]:unknown};
export type CardKind='correction'|'vocab'|'phrase'|'collocation'|'sentence';
// kind / said / note 来自练习单：said 是自己当时的原话，note 是简短说明。都可选，旧数据不受影响。
export type Card={zh:string,en:string,due:number,interval:number,memory?:StoredMemory,reviewHistory?:ReviewEvent[],scheduler?:'fsrs-6',kind?:CardKind,said?:string,note?:string,steps?:{en:string,zh?:string}[],parts?:{r:'S'|'V'|'O'|'C'|'K'|'A'|'J',t:string}[],pos?:{t:string,p:string}[]};
export type Lesson={id:string,date:string,topic:string,paragraph:string,cards:Card[],grammar?:string[],corrections?:{original:string,corrected:string,meaning?:string,explanation?:string}[]};
export type CardEntry={id:string,lessonId:string,index:number,date:string,topic:string,card:Card};
export type CardStatus='all'|'due'|'again'|'good';
export type CardFilters={status:CardStatus,date:string,topic:string,query:string};
export function allCards(lessons:Lesson[]):CardEntry[]{return lessons.flatMap(l=>l.cards.map((card,index)=>({id:l.id+'/'+index,lessonId:l.id,index,date:l.date,topic:l.topic,card})));}
export function lastRating(card:Card):ReviewRating|undefined{return card.reviewHistory?.at(-1)?.rating??(card.interval>=3?'good':undefined)}
export function filterCards(cards:CardEntry[],filters:CardFilters,now:number){const q=filters.query.trim().toLowerCase();return cards.filter(c=>(filters.status==='all'||(filters.status==='due'?c.card.due<=now:lastRating(c.card)===filters.status))&&(!filters.date||c.date===filters.date)&&(!filters.topic||c.topic===filters.topic)&&(!q||[c.card.zh,c.card.en,c.topic,c.date].join(' ').toLowerCase().includes(q)));}
