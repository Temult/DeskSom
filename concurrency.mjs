// A queued operation inherits a reserved slot before it resumes. New arrivals
// cannot take that slot between releasing the previous holder and its wake-up.
export function createConcurrencyGate(limit){
 if(!Number.isSafeInteger(limit)||limit<1)throw new TypeError('A positive concurrency limit is required');
 let occupied=0;const queue=[];
 return async function gate(fn){
  if(occupied>=limit)await new Promise(resolve=>queue.push(resolve));else occupied++;
  try{return await fn()}finally{const next=queue.shift();if(next)next();else occupied--}
 };
}
