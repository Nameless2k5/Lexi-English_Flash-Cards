const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const vm=require('node:vm');
const path=require('node:path');
const clone=x=>JSON.parse(JSON.stringify(x));
const empty=()=>({version:1,goal:10,progress:{},favorites:[],daily:{},lastTopic:null});
const state=n=>({...empty(),progress:{'daily-01':{seen:n,success:n,interval:3,due:123456}},favorites:['daily-01']});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function main(){
 const context={window:{},AbortController,TextEncoder,crypto:require('node:crypto').webcrypto,Date,URLSearchParams,navigator:{},setTimeout:()=>1,clearTimeout:()=>{}};
 vm.runInNewContext(await fs.readFile(path.join(__dirname,'../public/backup.js'),'utf8'),context);
 const api=context.window.LEXI_BACKUP;
 let assertions=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);assertions++;};const ok=(a,m)=>{assert.ok(a,m);assertions++;};
 function fixture(options={}){
  const f={local:clone(options.local??state(1)),present:options.present??true,initialError:!!options.initialError,online:options.online??true,user:{id:'alice',email:'alice@example.test'},cloud:options.cloud?clone(options.cloud):null,historical:new Map(),requests:[],replaced:0,statuses:[],store:new Map(),canRestore:true};
  if(options.meta)f.store.set('lexi-backup-v1',JSON.stringify(options.meta));
  f.fetch=async(url,init)=>{
   f.requests.push({url,...init,body:init.body?JSON.parse(init.body):undefined});
   if(init.method==='GET'){
    const revision=new URL(url,'https://lexi.test').searchParams.get('revision');
    const backup=revision?(f.historical.get(Number(revision))??(f.cloud?.revision===Number(revision)?f.cloud:null)):f.cloud;
    return Response.json({user:f.user,backup,history:[...(f.cloud?[f.cloud]:[]),...f.historical.values()].map(b=>({revision:b.revision,updatedAt:b.updatedAt,learned:Object.values(b.state.progress).filter(p=>p.seen>0).length}))});
   }
   const body=JSON.parse(init.body);f.cloud={state:clone(body.state),revision:(f.cloud?.revision??0)+1,updatedAt:new Date().toISOString()};
   return Response.json({userId:f.user.id,revision:f.cloud.revision,updatedAt:f.cloud.updatedAt});
  };
  f.hooks={read:()=>f.local,validate:clone,hasLocal:()=>f.present,initialError:()=>f.initialError,localAvailable:()=>true,canRestore:()=>f.canRestore,replace:s=>{f.local=clone(s);f.present=true;f.replaced++;},confirm:()=>true,onStatus:s=>f.statuses.push({...s,putCount:f.requests.filter(r=>r.method==='PUT').length})};
  f.controller=api.create(f.hooks,{fetch:(...args)=>f.fetch(...args),online:()=>f.online,storage:()=>({getItem:k=>f.store.get(k)??null,setItem:(k,v)=>f.store.set(k,v)}),digest:s=>f.digest?f.digest(s):Promise.resolve(api.canonical(s))});
  return f;
 }
 const cloud=(s,revision=1)=>({state:s,revision,updatedAt:'2026-11-18T01:00:00Z'});
 let f=fixture();await f.controller.connect();eq(f.requests.map(r=>r.method),['GET','PUT'],'read before first write');eq(f.controller.snapshot().status,'saved','confirmed ack only saved');eq(f.requests[1].body.userId,'alice','identity bound to PUT');eq(f.requests[1].body.baseRevision,0,'initial CAS');
 f=fixture({present:false,local:empty(),cloud:cloud(state(4))});await f.controller.connect();eq(f.replaced,1,'purged local recovers remote');eq(f.local,state(4),'full remote restored');eq(f.requests.map(r=>r.method),['GET'],'never default-write over recovered cloud');
 f=fixture({local:state(2),cloud:cloud(state(4))});await f.controller.connect();eq(f.controller.snapshot().status,'conflict','divergent local requires choice');eq(f.requests.length,1,'divergence no automatic write');await f.controller.chooseLocal();eq(f.requests[1].method,'PUT','chosen local may upload');eq(f.requests[1].body.baseRevision,1,'chosen local existing CAS');
 f=fixture({local:state(2),cloud:cloud(state(4))});await f.controller.connect();await f.controller.restore();eq(f.replaced,1,'explicit restore works');eq(f.local,state(4),'explicit restore full state');eq(f.requests.map(r=>r.method),['GET','GET'],'restore rechecks server first');
 f=fixture({initialError:true,present:false,local:empty(),cloud:cloud(state(4))});await f.controller.connect();eq(f.controller.snapshot().status,'conflict','unreadable local never silently discarded');eq(f.replaced,0,'initial read failure blocks auto-restore');eq(f.requests.length,1,'initial read failure blocks write');
 f=fixture({online:false});await f.controller.connect();eq(f.controller.snapshot().status,'offline','offline state honest');eq(f.requests.length,0,'offline never pretends request');f.online=true;await f.controller.sync(true);eq(f.controller.snapshot().status,'saved','online resumes pending state');
 f=fixture();f.fetch=async()=>Response.json({error:'signin_required'},{status:401});await f.controller.connect();eq(f.controller.snapshot().status,'signin','auth failure sign-in state');eq(f.controller.snapshot().lastBackupAt,null,'no false ack on401');
 f=fixture();f.fetch=async()=>Response.json({error:'unavailable'},{status:503});await f.controller.connect();eq(f.controller.snapshot().status,'error','server failure state honest');eq(f.controller.snapshot().lastBackupAt,null,'no false ack on503');

 // Pause while GET is pending: no restore, PUT, or silent re-enable on its completion.
 f=fixture({present:false,local:empty(),cloud:cloud(state(4))});let gate=deferred(),entered=deferred();f.fetch=async()=>{entered.resolve();await gate.promise;return Response.json({user:f.user,backup:f.cloud});};let run=f.controller.connect();await entered.promise;f.controller.pause();gate.resolve();await run;eq(f.controller.snapshot().enabled,false,'pause GET remains disabled');eq(f.controller.snapshot().status,'off','pause GET remains off');eq(f.replaced,0,'pause GET does not restore');

 // Pause a write in flight. It may reach server, but cannot re-enable future writes.
 f=fixture();gate=deferred();entered=deferred();let baseFetch=f.fetch;f.fetch=async(...args)=>{if(args[1].method==='PUT'){entered.resolve();await gate.promise;}return baseFetch(...args);};run=f.controller.connect();await entered.promise;f.controller.pause();gate.resolve();await run;eq(f.controller.snapshot().enabled,false,'pause PUT remains disabled');eq(f.controller.snapshot().status,'off','pause PUT remains off');eq(JSON.parse(f.store.get('lexi-backup-v1')).enabled,false,'pause flag persisted through lateack');

 // An account switch after the restore confirmation cannot restore another user's same-revision state.
 f=fixture({local:state(2),cloud:cloud(state(4),1)});await f.controller.connect();f.user={id:'bob',email:'bob@example.test'};f.cloud=cloud(state(9),1);await f.controller.restore();eq(f.replaced,0,'account switch blocks stale restore choice');eq(f.local,state(2),'account switch retains existing local');eq(f.controller.snapshot().status,'conflict','account switch re-asks choice');

 // A new edit made while an old digest is pending must not be announced as saved.
 f=fixture({cloud:cloud(state(1))});gate=deferred();entered=deferred();let calls=0;f.digest=s=>{const hash=api.canonical(s);calls++;if(calls===2){entered.resolve();return gate.promise.then(()=>hash);}return Promise.resolve(hash);};run=f.controller.connect();await entered.promise;f.local=state(8);f.controller.changed();const mark=f.statuses.length;gate.resolve();await run;eq(f.cloud.state,state(8),'edit during reconcile hashing gets uploaded');ok(!f.statuses.slice(mark).some(s=>s.status==='saved'&&s.putCount===0),'hash race cannot acknowledge old captured state');eq(f.controller.snapshot().status,'saved','current edit saved only after ack');

 // An edit while PUT is pending stays visibly pending after the older response.
 f=fixture();gate=deferred();entered=deferred();baseFetch=f.fetch;f.fetch=async(...args)=>{if(args[1].method==='PUT'){entered.resolve();await gate.promise;}return baseFetch(...args);};run=f.controller.connect();await entered.promise;f.local=state(7);f.controller.changed();gate.resolve();await run;eq(f.controller.snapshot().status,'pending','new edit during PUT stays pending');eq(f.cloud.state,state(1),'ack only covered captured older state');await f.controller.sync();eq(f.cloud.state,state(7),'subsequent sync saves new state');eq(f.controller.snapshot().status,'saved','current state ack then saved');

 // Existing local identity from another account requires a deliberate choice, including when cloud is empty.
 f=fixture({local:state(4),meta:{enabled:true,userId:'bob',ackHash:'old'}});await f.controller.connect();eq(f.controller.snapshot().status,'conflict','different identity local cannot auto-upload');eq(f.requests.length,1,'account mismatch GET only');

 // Cached metadata can recover a successful write whose HTTP acknowledgement was lost.
 const savedState=state(4),hash=api.canonical(savedState);f=fixture({local:savedState,cloud:cloud(savedState,3),meta:{enabled:true,userId:'alice',pendingHash:hash}});await f.controller.connect();eq(f.controller.snapshot().status,'saved','lost ack recognized from exact server state');eq(f.requests.map(r=>r.method),['GET'],'lost ack does not duplicate writes');

 f=fixture();baseFetch=f.fetch;f.fetch=async(...args)=>args[1].method==='PUT'?Response.json({revision:1}):baseFetch(...args);await f.controller.connect();eq(f.controller.snapshot().status,'error','malformed success response is not an acknowledgement');eq(f.controller.snapshot().lastBackupAt,null,'malformed ack never claims timestamp');
 f=fixture();await f.controller.checkPersistence();eq(f.controller.snapshot().persistent,'unsupported','unsupported persistence reported');
 context.navigator.storage={persisted:async()=>true,persist:async()=>{throw new Error('should not request');}};await f.controller.checkPersistence();eq(f.controller.snapshot().persistent,'granted','existing persistent grant honored');
 let persistCalls=0;context.navigator.storage={persisted:async()=>false,persist:async()=>{persistCalls++;return false;}};await f.controller.checkPersistence();eq(f.controller.snapshot().persistent,'available','check does not falsely claim grant');eq(persistCalls,0,'persistence not requested without interaction');await f.controller.checkPersistence(true);eq(f.controller.snapshot().persistent,'denied','denial reported honestly');eq(persistCalls,1,'manual action requests once');
 context.navigator.storage={persisted:async()=>false,persist:async()=>true};await f.controller.checkPersistence(true);eq(f.controller.snapshot().persistent,'granted','manual grant result honored');
 context.navigator.storage={persisted:async()=>{throw new Error('storage blocked');},persist:async()=>false};await f.controller.checkPersistence();eq(f.controller.snapshot().persistent,'error','storage check exception reported');

 // A historical restore deliberately replaces local state, then CAS-writes against latest revision, not the historical one.
 f=fixture({local:state(6),cloud:cloud(state(8),3)});f.historical.set(1,cloud(state(2),1));await f.controller.connect();const historyMark=f.statuses.length;await f.controller.restoreHistorical(1);eq(f.local,state(2),'historical state restored locally');const historyPut=f.requests.find(r=>r.method==='PUT');eq(historyPut.body.baseRevision,3,'historical restore uses latest remote CAS');eq(historyPut.body.userId,'alice','historical restore bound to confirmed account');eq(f.cloud.state,state(2),'historical state becomes new cloud snapshot');eq(f.cloud.revision,4,'historical restore creates next revision');ok(!f.statuses.slice(historyMark).some(s=>s.status==='saved'&&s.putCount===0),'history not acknowledged before write');eq(f.controller.snapshot().status,'saved','historical state saved after server ack');

 f=fixture({local:state(6),cloud:cloud(state(8),3)});f.historical.set(1,cloud(state(2),1));await f.controller.connect();f.user={id:'bob',email:'bob@example.test'};f.cloud=cloud(state(9),3);await f.controller.restoreHistorical(1);eq(f.replaced,0,'account change blocks historical restore');eq(f.requests.filter(r=>r.method==='PUT').length,0,'account change historical flow does not write');eq(f.controller.snapshot().status,'conflict','changed account requires new history choice');

 f=fixture({local:state(6),cloud:cloud(state(8),3)});f.historical.set(1,cloud(state(2),1));await f.controller.connect();gate=deferred();entered=deferred();baseFetch=f.fetch;f.fetch=async(...args)=>{if(args[0].includes('revision=')){entered.resolve();await gate.promise;}return baseFetch(...args);};run=f.controller.restoreHistorical(1);await entered.promise;f.controller.pause();gate.resolve();await run;eq(f.replaced,0,'pause blocks in-flight historical restore');eq(f.controller.snapshot().enabled,false,'history completion cannot re-enable');eq(f.controller.snapshot().status,'off','paused history stays off');

 async function settle(controller){for(let i=0;i<300&&controller.snapshot().busy;i++)await Promise.resolve();assert.equal(controller.snapshot().busy,false,'controller settled');}
 f=fixture({cloud:cloud(state(1))});f.controller.start(true);await settle(f.controller);eq(f.controller.snapshot().enabled,true,'auth return can resume explicit connect after metadata eviction');eq(f.controller.snapshot().status,'saved','auth return reads and acknowledges existing account');eq(f.requests.map(r=>r.method),['GET'],'auth return reads before any write');
 f=fixture();f.controller.start();await settle(f.controller);eq(f.controller.snapshot().enabled,false,'ordinary boot remains opt-in');eq(f.requests.length,0,'ordinary boot sends no progress request');
 // Sign-out preserves progress, blocks late requests, and requires a fresh account decision.
 f=fixture();await f.controller.connect();const beforeLogout=clone(f.local),cloudBefore=clone(f.cloud),requestCount=f.requests.length;eq(f.controller.prepareSignOut(),true,'saved account may sign out');eq(f.controller.snapshot().enabled,false,'logout stops autosave');eq(f.controller.snapshot().status,'signedout','logout exposes account choice');eq(f.controller.snapshot().user,null,'logout clears displayed identity');eq(f.controller.snapshot().lastBackupAt,null,'logout hides prior account timestamp');eq(f.local,beforeLogout,'logout preserves local progress');eq(f.cloud,cloudBefore,'logout preserves cloud snapshot');f.controller.changed();f.controller.resume();eq(f.requests.length,requestCount,'signed out edits do not upload');
 f.user={id:'bob',email:'bob@example.test'};f.cloud=null;await f.controller.connect();eq(f.controller.snapshot().status,'conflict','new account needs explicit local progress choice');eq(f.requests.filter(r=>r.method==='PUT').length,1,'old local state is not silently uploaded to new account');
 f=fixture();await f.controller.connect();f.local=state(7);f.controller.changed();f.hooks.confirm=()=>false;eq(f.controller.prepareSignOut(),false,'unsaved logout may be canceled');eq(f.controller.snapshot().enabled,true,'canceled logout keeps backup enabled');f.hooks.confirm=()=>true;eq(f.controller.prepareSignOut(),true,'unsaved logout explicitly confirmed');eq(f.controller.snapshot().enabled,false,'confirmed logout disables backup');
 f=fixture();gate=deferred();entered=deferred();baseFetch=f.fetch;f.fetch=async(...args)=>{if(args[1].method==='PUT'){entered.resolve();await gate.promise;}return baseFetch(...args);};run=f.controller.connect();await entered.promise;eq(f.controller.prepareSignOut(),true,'inflight logout allowed after warning');gate.resolve();await run;eq(f.controller.snapshot().status,'signedout','late acknowledgement cannot sign account back in');eq(f.controller.snapshot().enabled,false,'late acknowledgement cannot restart autosave');
 const accountMarkup=api.panel({status:'saved',enabled:true,user:{id:'alice',email:'alice@example.test'},persistent:'available',localSaved:true,history:[]});ok(accountMarkup.includes('data-backup-signout'),'signed in panel exposes logout');ok(accountMarkup.includes('/signout-with-chatgpt?return_to=%2F%3Fbackup%3Daccount%23progress'),'logout uses platform route and safe relative return');const signedOutMarkup=api.panel({status:'signedout',enabled:false,persistent:'available',localSaved:true});ok(signedOutMarkup.includes('Đăng nhập bằng ChatGPT'),'signed out panel offers sign in');ok(!signedOutMarkup.includes('data-backup-signout'),'signed out panel hides stale logout');
 console.log(`PASS: ${assertions} client-controller assertions including account/pause/hash/write races`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
