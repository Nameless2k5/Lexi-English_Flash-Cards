const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const vm=require('node:vm');
const path=require('node:path');
const {build}=require('esbuild');
async function main(){
  const root=path.resolve(__dirname,'..'),context={window:{},atob};
  vm.runInNewContext(await fs.readFile(path.join(root,'public/profile.js'),'utf8'),context);
  const api=context.window.LEXI_PROFILE,output=path.join(root,'.sites-runtime/tests/profile-schema.cjs');
  await fs.mkdir(path.dirname(output),{recursive:true});
  await build({entryPoints:[path.join(root,'lib/profile-schema.ts')],bundle:true,platform:'node',format:'cjs',outfile:output});
  const {validateProfile}=require(output),plain=x=>JSON.parse(JSON.stringify(x));
  const image='data:image/jpeg;base64,'+Buffer.from([255,216,255,0,255,217]).toString('base64');
  const fixtures=[null,undefined,[],42,'profile',{},
    {nickname:'  Mèo   học tốt 🌱  ',avatar:'fox',color:'peach'},
    {nickname:'a'.repeat(99),avatar:'unknown',color:'red'},
    {nickname:'🧑‍🚀 Linh',image},
    {nickname:'A\u202eBC\u0000 D\u200b',image:'https://tracking.test/photo.jpg'},
    {nickname:'<img src=x onerror=1>',image:'data:image/svg+xml;base64,PHN2Zz4='},
    {nickname:'a\u0301',image:'javascript:alert(1)'},
    {image:'data:image/jpeg;base64,/9j/AAAAAAAA'},
    {image:'data:image/jpeg;base64,'+'A'.repeat(90001)}];
  for(const [avatar] of api.avatars)for(const [color] of api.colors)fixtures.push({nickname:'Bạn ✨',avatar,color,image});
  for(const raw of fixtures)assert.deepEqual(plain(api.validate(raw)),validateProfile(raw),'client/server profile validation parity');
  assert.equal(api.validate({nickname:'🙂'.repeat(40)}).nickname,'🙂'.repeat(24));
  assert.equal(api.validate({nickname:'🧑‍🚀 Linh'}).nickname,'🧑‍🚀 Linh');
  assert.equal(api.validate({nickname:'  Ánh   Trần  '}).nickname,'Ánh Trần');
  assert.equal(api.validate({image}).image,image);
  assert.equal(api.validate({image:'data:image/jpeg;base64,/9j/AAAAAAAA'}).image,null);
  assert.equal(api.validate({image:'data:image/svg+xml,<svg onload=alert(1)>'}).image,null);
  for(const raw of fixtures){const html=api.avatar(raw,36);assert.ok(!html.includes('tracking.test'));assert.ok(!html.includes('<svg'));assert.ok(!html.includes('onerror='));assert.ok(!html.includes('javascript:'));}
  await assert.rejects(()=>api.photo({size:9*1024*1024,type:'image/jpeg'}),/8 MB/);
  await assert.rejects(()=>api.photo({size:20,type:'image/svg+xml'}),/JPG/);
  for(const file of ['data.js','toeic.js'])vm.runInNewContext(await fs.readFile(path.join(root,'public',file),'utf8'),context);
  context.byId=new Map([...context.window.LEXI_DATA.topics,...context.window.LEXI_TOEIC_TOPICS].flatMap(t=>t.words.map(w=>[w.id,w])));
  context.topicById=new Map([...context.window.LEXI_DATA.topics,...context.window.LEXI_TOEIC_TOPICS].map(t=>[t.id,t]));
  const app=await fs.readFile(path.join(root,'public/app.js'),'utf8');
  const defs=app.split('\n').filter(l=>l.includes('const defaultProfile=')||l.includes('const defaults=')).join('\n');
  vm.runInContext(defs+'\n'+app.slice(app.indexOf('  function validate(raw)'),app.indexOf('  let state=defaults(),')),context);
  const old={version:1,goal:15,progress:{'daily-01':{seen:3,success:2,interval:3,due:123456},'toeic-800-01':{seen:1,success:1,interval:1,due:123456}},favorites:['daily-01'],daily:{},lastTopic:'toeic-800'};
  const migrated=plain(context.validate(old));
  assert.deepEqual(migrated,{...old,profile:plain(api.defaults())},'old saved progress migrates without changing learning data');
  const next={...old,profile:{nickname:'Linh 🌱',avatar:'fox',color:'mint',image}};
  assert.deepEqual(plain(context.validate(JSON.parse(JSON.stringify({app:'lexi',...next})))),next,'profile survives JSON export/import validation');
  const html=await fs.readFile(path.join(root,'public/index.html'),'utf8'),sw=await fs.readFile(path.join(root,'public/sw.js'),'utf8');
  assert.ok(html.indexOf('src="profile.js"')<html.indexOf('src="app.js"'));assert.ok(sw.includes("'./profile.js'"));
  console.log('PASS: profile validator parity, image restrictions, Unicode names, old progress migration and backup export/import');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
