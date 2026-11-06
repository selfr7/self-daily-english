import {DefaultScheduler,Rating,State} from 'ts-fsrs';
import type {Card,ReviewRating,StoredMemory} from './cards.ts';
const createScheduler=()=>DefaultScheduler({version:'FSRS-6',desiredRetention:.9,enableFuzz:false,learningSteps:['10m'],relearningSteps:['10m']});
const scheduler=createScheduler();
export async function reviewCard(card:Card,id:string,rating:ReviewRating,requestId:string,now:number):Promise<Card>{
 if(card.reviewHistory?.some(e=>e.id===requestId))return card;
 const s=await scheduler,date=new Date(now);
 let memory=s.newCard({cardId:id,now:date});
 if(card.memory){memory={...card.memory,dueAt:new Date(card.memory.dueAt),lastReviewAt:card.memory.lastReviewAt?new Date(card.memory.lastReviewAt):null} as typeof memory;}
 else if(card.interval>0){
  // Preserve the existing due date; infer only the last interval, never fabricate a review log.
  memory={...memory,dueAt:new Date(card.due),lastReviewAt:new Date(card.due-card.interval*86400000),stability:Math.max(.1,card.interval),difficulty:5,state:State.Review,scheduleStatus:'review',scheduledDays:card.interval,reps:1};
 }
 const result=s.review({card:memory,grade:rating==='again'?Rating.Again:Rating.Good,now:date});
 // Practice is once a day: a forgotten card comes back no sooner than tomorrow 00:00 Beijing time.
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(date);
 const tomorrow=Date.parse(day+'T00:00:00+08:00')+86400000;
 const due=rating==='again'?Math.max(result.card.dueAt.getTime(),tomorrow):result.card.dueAt.getTime();
 const stored=JSON.parse(JSON.stringify({...result.card,dueAt:new Date(due)})) as StoredMemory;
 return {...card,due,interval:(due-now)/86400000,memory:stored,scheduler:'fsrs-6',reviewHistory:[...(card.reviewHistory??[]),{id:requestId,at:now,rating,due,log:JSON.parse(JSON.stringify(result.revlog))}]};
}
