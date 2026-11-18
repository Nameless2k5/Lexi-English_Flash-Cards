'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../public/theme.js'),'utf8');
function boot({stored=null,dark=false,blocked=false,legacy=false,media=true}={}){
 const events={},root={dataset:{},style:{}},meta={},writes=[],notifications=[];
 const query={matches:dark};if(legacy)query.addListener=fn=>query.change=fn;else query.addEventListener=(name,fn)=>query.change=fn;
 const store={getItem(){if(blocked)throw Error('blocked');return stored;},setItem(key,value){if(blocked)throw Error('full');writes.push([key,value]);stored=value;}};
 const window={addEventListener:(name,fn)=>events[name]=fn};
 const context={window,document:{documentElement:root,querySelector:()=>meta,dispatchEvent:event=>notifications.push(event)},localStorage:store,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}}};
 if(media)context.matchMedia=()=>query;vm.runInNewContext(source,context);
 return {api:window.LEXI_THEME,root,meta,writes,notifications,query,events,stored:()=>stored};
}
let t=boot({dark:true});assert.equal(t.root.dataset.theme,'dark');assert.equal(t.api.getPreference(),'system');assert.equal(t.meta.content,'#121818');assert.equal(t.root.style.colorScheme,'dark');assert.equal(t.writes.length,0);
t.query.matches=false;t.query.change();assert.equal(t.root.dataset.theme,'light');assert.equal(t.meta.content,'#f8faf6');
t.api.setPreference('dark');assert.equal(t.stored(),'dark');t.query.matches=false;t.query.change();assert.equal(t.api.getResolved(),'dark');assert.equal(boot({stored:t.stored()}).api.getResolved(),'dark');
t.api.toggle();assert.equal(t.api.getPreference(),'light');assert.equal(t.api.getResolved(),'light');assert.equal(t.stored(),'light');
t.events.storage({key:'lexi-progress-v1',newValue:'dark'});assert.equal(t.api.getPreference(),'light');
t.events.storage({key:'lexi-theme-v1',newValue:'system'});assert.equal(t.api.getPreference(),'system');assert.equal(t.api.getResolved(),'light');t.query.matches=true;t.query.change();assert.equal(t.api.getResolved(),'dark');
t.events.storage({key:null,newValue:null});assert.equal(t.api.getPreference(),'system');
const count=t.writes.length;t.events.storage({key:'lexi-theme-v1',newValue:'light'});assert.equal(t.writes.length,count);assert.equal(t.api.getResolved(),'light');
assert.equal(t.api.setPreference('invalid').saved,false);assert.equal(t.api.getPreference(),'light');
assert.equal(boot({stored:'invalid',dark:true}).api.getResolved(),'dark');assert.equal(boot({stored:'light',dark:true}).api.getResolved(),'light');
t=boot({blocked:true});assert.equal(t.api.setPreference('dark').saved,false);assert.equal(t.api.getResolved(),'dark');assert.equal(t.root.dataset.theme,'dark');
t=boot({legacy:true});t.query.matches=true;t.query.change();assert.equal(t.api.getResolved(),'dark');
assert.equal(boot({media:false}).api.getResolved(),'light');
const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8'),sw=fs.readFileSync(path.join(__dirname,'../public/sw.js'),'utf8');
assert.ok(html.indexOf('src="theme.js"')<html.indexOf('href="styles.css"'));assert.ok(!/src="theme.js"[^>]*(?:defer|async)/.test(html));assert.ok(sw.includes("'./theme.js'"));assert.ok(sw.includes("'./theme.css'"));
console.log('Theme: persistence, system changes, cross-tab sync, blocked storage and offline shell passed');
