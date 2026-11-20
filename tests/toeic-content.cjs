const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),context={window:{}};
for(const name of ['data.js','toeic.js','synonyms.js'])vm.runInNewContext(fs.readFileSync(path.join(root,'public',name),'utf8'),context);
const base=context.window.LEXI_DATA.topics,added=context.window.LEXI_TOEIC_TOPICS;
assert.equal(base.length,10);assert.equal(base.flatMap(t=>t.words).length,160);
assert.deepEqual(Array.from(added,t=>t.target),[400,500,600,700,800]);
const topics=[...base,...added],words=topics.flatMap(t=>t.words.map(w=>({...w,topic:t.id}))),byId=new Map(words.map(w=>[w.id,w]));
assert.equal(byId.size,260);
assert.equal(new Set(words.map(w=>w.word.toLowerCase())).size,260,'no duplicate headwords');
for(const t of added){
  assert.equal(t.words.length,20);assert.equal(t.id,'toeic-'+t.target);
  for(const w of t.words){
    assert.match(w.id,new RegExp('^toeic-'+t.target+'-\\d{2}$'));
    for(const f of ['word','ipa','meaning','pos','example','translation','collocation','usage','context'])assert.ok(typeof w[f]==='string'&&w[f].trim(),w.id+': '+f);
    assert.ok(['A2','B1','B2','C1'].includes(w.level));
    assert.match(w.ipa,/^\/.+\/$/);assert.equal(w.toeicTarget,t.target);
  }
}
const catalog=JSON.parse(fs.readFileSync(path.join(root,'lib/lexi-catalog.json'),'utf8'));
assert.deepEqual(catalog.words,words.map(w=>w.id),'cloud validation includes every old and new word');
assert.deepEqual(catalog.topics,topics.map(t=>t.id));
const app=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
const normalize=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase();
const sandbox={words,byId,shuffle:a=>[...a],filters:{level:'all',query:'',saved:false,toeic:'all'},isSaved:()=>true,dictionaryIndex:new Map(words.map(w=>[w.id,normalize(w.word+' '+w.meaning+' '+(w.context||'')+' '+(w.collocation||''))])),normalize};
vm.createContext(sandbox);
vm.runInContext(app.slice(app.indexOf('  function makeQuestion('),app.indexOf('  function renderSession(')),sandbox);
vm.runInContext(app.slice(app.indexOf('  function dictionaryResults('),app.indexOf('  function renderDictionary(')),sandbox);
for(const w of added.flatMap(t=>t.words)){
  const q=sandbox.makeQuestion(w.id,1);
  assert.equal(q.context,true,w.word+' occurs unchanged in original example');
  assert.ok(q.prompt.includes('________'));assert.equal(q.options.length,4);assert.ok(q.options.includes(w.id));
  assert.equal(new Set(q.options.map(id=>byId.get(id).word)).size,4);
}
assert.equal(sandbox.dictionaryResults().length,260);
sandbox.filters.toeic='toeic';assert.equal(sandbox.dictionaryResults().length,100);
for(const target of [400,500,600,700,800]){sandbox.filters.toeic=String(target);assert.equal(sandbox.dictionaryResults().length,20);}
sandbox.filters={level:'all',query:'kiem ke',saved:false,toeic:'toeic'};
assert.ok(sandbox.dictionaryResults().some(w=>w.word==='inventory'),'Vietnamese search finds TOEIC meaning');
sandbox.filters={level:'all',query:'stringent standards',saved:false,toeic:'800'};
assert.ok(sandbox.dictionaryResults().some(w=>w.word==='stringent'),'search includes collocations');
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8'),sw=fs.readFileSync(path.join(root,'public/sw.js'),'utf8');
assert.ok(html.indexOf('src="toeic.js"')>html.indexOf('src="data.js"'));
assert.ok(html.indexOf('src="toeic.js"')<html.indexOf('src="app.js"'));
assert.ok(sw.includes("'./toeic.js'"));assert.ok(sw.includes('lexi-v21-aligned-banner'));
console.log('PASS: 100 TOEIC entries, 260 stable IDs, cloud catalog, all cloze questions, target/search filters and offline assets');
