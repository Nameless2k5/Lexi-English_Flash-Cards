const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),context={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'public/avatar-crop.js'),'utf8'),context);
const api=context.window.LEXI_AVATAR_CROP;
let checks=0;
const near=(a,b)=>{assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);checks++;};
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
assert.throws(()=>api.create(0,200));assert.throws(()=>api.create(100,Infinity));checks+=2;
let model=api.create(600,300),g=api.geometry(model);near(g.scale,1/300);near(g.limitX,.5);near(g.limitY,0);
model=api.pan(model,99,99);near(model.x,.5);near(model.y,0);
model=api.pan(model,-99,-99);near(model.x,-.5);near(model.y,0);
model=api.rotate(model);eq(model.rotation,90);near(model.x,0);near(model.y,0);near(model.zoom,1);
g=api.geometry(model);near(g.limitX,0);near(g.limitY,.5);
for(let i=0;i<3;i++)model=api.rotate(model);eq(model.rotation,0);
eq(api.rotate(model,-1).rotation,270);
near(api.zoom(model,99).zoom,4);near(api.zoom(model,-99).zoom,1);

// Panning, pinching and rotation must never uncover a blank edge of the crop.
for(const [width,height] of [[600,300],[300,600],[100,100],[4000,300],[300,4000]]){
 for(const rotation of [0,90,180,270])for(const z of [1,1.25,2,4])for(const [x,y] of [[-10,-10],[0,0],[10,10],[.23,-.42]]){
  const s=api.pan(api.zoom({...api.create(width,height),rotation},z),x,y),m=api.geometry(s);
  const rw=rotation%180?height:width,rh=rotation%180?width:height;
  assert.ok(m.x-rw*m.scale/2<=-.5+1e-10);assert.ok(m.x+rw*m.scale/2>=.5-1e-10);
  assert.ok(m.y-rh*m.scale/2<=-.5+1e-10);assert.ok(m.y+rh*m.scale/2>=.5-1e-10);checks+=4;
  near(s.x,m.x);near(s.y,m.y);
 }
}
// A zoom focal point should stay over the same source position when unclamped.
model={...api.create(300,300),zoom:2,x:.1,y:-.2};
const anchor={x:.1,y:.1},next=api.zoom(model,3,anchor.x,anchor.y),before=api.geometry(model),after=api.geometry(next);
near((anchor.x-model.x)/before.scale,(anchor.x-next.x)/after.scale);
near((anchor.y-model.y)/before.scale,(anchor.y-next.y)/after.scale);
const moved={x:.2,y:.05},pinched=api.pinch(model,3,anchor,moved),pg=api.geometry(pinched);
near((anchor.x-model.x)/before.scale,(moved.x-pinched.x)/pg.scale);
near((anchor.y-model.y)/before.scale,(moved.y-pinched.y)/pg.scale);

// Preview and saved JPEG use the same transform at different resolutions.
function capture(size){const calls=[];return {width:size,calls,getContext(){return {setTransform(){},fillRect(){},save(){},restore(){},set fillStyle(v){},translate(x,y){calls.push(['translate',x/size,y/size]);},rotate(r){calls.push(['rotate',r]);},scale(x,y){calls.push(['scale',x/size,y/size]);},drawImage(img,x,y){calls.push(['source',x,y]);}};}};}
const preview=capture(640),output=capture(192),framed=api.pan(api.zoom(api.rotate(api.create(600,300)),2.7),.2,-.3);
api.draw(preview,{},framed);api.draw(output,{},framed);
for(let i=0;i<preview.calls.length;i++){eq(preview.calls[i][0],output.calls[i][0]);for(let n=1;n<preview.calls[i].length;n++)near(preview.calls[i][n],output.calls[i][n]);}
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8'),sw=fs.readFileSync(path.join(root,'public/sw.js'),'utf8');
assert.ok(html.indexOf('src="avatar-crop.js"')<html.indexOf('src="profile.js"'));assert.ok(sw.includes("'./avatar-crop.js'"));checks+=2;
console.log(`PASS: ${checks} crop geometry, edge coverage, pinch anchor and preview/export checks`);
