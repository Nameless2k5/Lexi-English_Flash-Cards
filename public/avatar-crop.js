/* Avatar framing uses viewport-relative coordinates, shared by preview and export. */
(() => {
  'use strict';
  const clamp=(n,min,max)=>Math.min(max,Math.max(min,Number.isFinite(n)?n:min));
  function create(width,height){
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new Error('Invalid image dimensions');
    return {width,height,rotation:0,zoom:1,x:0,y:0};
  }
  function geometry(model){
    const sideways=model.rotation%180!==0,w=sideways?model.height:model.width,h=sideways?model.width:model.height;
    const scale=clamp(model.zoom,1,4)/Math.min(w,h),limitX=Math.max(0,(w*scale-1)/2),limitY=Math.max(0,(h*scale-1)/2);
    return {scale,limitX,limitY,x:clamp(model.x,-limitX,limitX),y:clamp(model.y,-limitY,limitY)};
  }
  function constrain(model){const g=geometry(model);return {...model,zoom:clamp(model.zoom,1,4),x:g.x,y:g.y};}
  const pan=(model,x,y)=>constrain({...model,x:model.x+x,y:model.y+y});
  function zoom(model,value,anchorX=0,anchorY=0){
    const next=clamp(value,1,4),ratio=next/model.zoom;
    return constrain({...model,zoom:next,x:anchorX+(model.x-anchorX)*ratio,y:anchorY+(model.y-anchorY)*ratio});
  }
  function pinch(start,value,from,to){
    const next=clamp(value,1,4),ratio=next/start.zoom;
    return constrain({...start,zoom:next,x:to.x+(start.x-from.x)*ratio,y:to.y+(start.y-from.y)*ratio});
  }
  const rotate=(model,direction=1)=>({...create(model.width,model.height),rotation:(model.rotation+direction*90+360)%360});
  function draw(canvas,image,model){
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Trình duyệt chưa xử lý được ảnh.');
    const size=canvas.width,g=geometry(model);
    ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#fff';ctx.fillRect(0,0,size,size);
    ctx.save();ctx.translate(size*(.5+g.x),size*(.5+g.y));ctx.rotate(model.rotation*Math.PI/180);
    ctx.scale(g.scale*size,g.scale*size);ctx.drawImage(image,-model.width/2,-model.height/2);ctx.restore();
  }
  let active=null;
  function cancel(){active?.();}
  function open(image){
    cancel();
    const original=create(image.naturalWidth,image.naturalHeight),focusBefore=document.activeElement;
    let model={...original},frame=0,finished=false,pinchStart=null;
    const pointers=new Map(),dialog=document.createElement('dialog');
    dialog.className='avatar-crop-dialog';dialog.setAttribute('aria-labelledby','avatar-crop-title');
    dialog.innerHTML='<div class="avatar-crop-shell"><header class="avatar-crop-head"><div><div class="eyebrow">A LITTLE MORE YOU</div><h2 id="avatar-crop-title">Chọn góc ảnh của bạn</h2></div><button class="icon-button" type="button" data-crop="cancel" aria-label="Đóng căn chỉnh ảnh">×</button></header><div class="avatar-crop-layout"><div><div class="avatar-crop-stage" tabindex="0" role="group" aria-label="Vùng căn chỉnh ảnh đại diện" aria-describedby="avatar-crop-help"><canvas width="640" height="640" aria-hidden="true"></canvas><div class="avatar-crop-guide" aria-hidden="true"></div></div><p id="avatar-crop-help">Kéo ảnh để căn vị trí. Dùng hai ngón để thu phóng trên điện thoại, hoặc phím mũi tên khi vùng ảnh đang được chọn.</p></div><section class="avatar-crop-controls"><div class="avatar-crop-preview-row"><canvas class="avatar-crop-preview" width="192" height="192" aria-label="Xem trước avatar sau khi cắt"></canvas><div><h3>Avatar của bạn</h3><p>Phần sáng trong khung sẽ xuất hiện trên hồ sơ.</p></div></div><div class="avatar-crop-zoom-label"><label for="avatar-crop-zoom">Thu phóng</label><output id="avatar-crop-percent" for="avatar-crop-zoom">100%</output></div><div class="avatar-crop-zoom"><button type="button" class="icon-button" data-crop="out" aria-label="Thu nhỏ ảnh">−</button><input id="avatar-crop-zoom" type="range" min="1" max="4" step="0.01" value="1" aria-label="Mức phóng to ảnh"><button type="button" class="icon-button" data-crop="in" aria-label="Phóng to ảnh">+</button></div><div class="avatar-crop-tools"><button class="btn btn-outline" type="button" data-crop="left">↶ Xoay trái</button><button class="btn btn-outline" type="button" data-crop="right">↷ Xoay phải</button><button class="btn btn-ghost" type="button" data-crop="reset">Đặt lại</button></div><p class="avatar-crop-note">Ảnh gốc chỉ được xử lý trên thiết bị. Bấm “Dùng ảnh này”, rồi “Lưu hồ sơ” để áp dụng.</p></section></div><footer class="avatar-crop-footer"><button class="btn btn-ghost" type="button" data-crop="cancel">Hủy</button><button class="btn btn-primary" type="button" data-crop="apply">Dùng ảnh này</button></footer></div>';
    document.body.append(dialog);
    const stage=dialog.querySelector('.avatar-crop-stage'),canvas=stage.querySelector('canvas'),preview=dialog.querySelector('.avatar-crop-preview'),slider=dialog.querySelector('#avatar-crop-zoom'),percent=dialog.querySelector('#avatar-crop-percent');
    return new Promise((resolve,reject)=>{
      function finish(result,error){
        if(finished)return;finished=true;cancelAnimationFrame(frame);pointers.clear();
        if(active===abort)active=null;
        if(dialog.open)dialog.close();dialog.remove();
        if(focusBefore?.isConnected)focusBefore.focus({preventScroll:true});
        if(error)reject(error);else resolve(result);
      }
      const abort=()=>finish(null);active=abort;
      function paint(){
        frame=0;if(finished)return;
        try{draw(canvas,image,model);draw(preview,image,model);slider.value=String(model.zoom);percent.value=Math.round(model.zoom*100)+'%';}
        catch(error){finish(null,error);}
      }
      function update(next){model=next;if(!frame)frame=requestAnimationFrame(paint);}
      const point=p=>{const r=stage.getBoundingClientRect();return {x:(p.x-r.left)/r.width-.5,y:(p.y-r.top)/r.height-.5};};
      const pair=()=>{const [a,b]=[...pointers.values()];return {distance:Math.hypot(a.x-b.x,a.y-b.y),anchor:point({x:(a.x+b.x)/2,y:(a.y+b.y)/2})};};
      stage.addEventListener('pointerdown',e=>{
        if(e.button>0)return;e.preventDefault();stage.focus({preventScroll:true});stage.setPointerCapture(e.pointerId);
        pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});stage.classList.add('dragging');
        if(pointers.size===2){const p=pair();pinchStart={...p,model:{...model}};}
      });
      stage.addEventListener('pointermove',e=>{
        const old=pointers.get(e.pointerId);if(!old)return;e.preventDefault();
        pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
        if(pointers.size===2&&pinchStart){const p=pair();if(pinchStart.distance>0)update(pinch(pinchStart.model,pinchStart.model.zoom*p.distance/pinchStart.distance,pinchStart.anchor,p.anchor));}
        else if(pointers.size===1){const r=stage.getBoundingClientRect();update(pan(model,(e.clientX-old.x)/r.width,(e.clientY-old.y)/r.height));}
      });
      function release(e){pointers.delete(e.pointerId);pinchStart=null;if(stage.hasPointerCapture(e.pointerId))stage.releasePointerCapture(e.pointerId);if(!pointers.size)stage.classList.remove('dragging');}
      stage.addEventListener('pointerup',release);stage.addEventListener('pointercancel',release);stage.addEventListener('lostpointercapture',e=>{pointers.delete(e.pointerId);pinchStart=null;if(!pointers.size)stage.classList.remove('dragging');});
      stage.addEventListener('wheel',e=>{e.preventDefault();const p=point({x:e.clientX,y:e.clientY});update(zoom(model,model.zoom*Math.exp(-e.deltaY*.0015),p.x,p.y));},{passive:false});
      stage.addEventListener('keydown',e=>{
        const step=e.shiftKey ? .08 : .02,moves={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]};
        if(moves[e.key]){e.preventDefault();e.stopPropagation();update(pan(model,...moves[e.key]));}
        else if(['+','=','-'].includes(e.key)){e.preventDefault();e.stopPropagation();update(zoom(model,model.zoom+(e.key==='-'?-.1:.1)));}
      });
      slider.addEventListener('input',()=>update(zoom(model,Number(slider.value))));
      dialog.addEventListener('click',e=>{
        const action=e.target.closest('[data-crop]')?.dataset.crop;if(!action)return;
        if(action==='cancel'){finish(null);return;}
        if(action==='apply'){
          try{draw(preview,image,model);finish(preview.toDataURL('image/jpeg',.82));}catch(error){finish(null,error);}return;
        }
        if(action==='reset')update({...original});
        if(action==='left'||action==='right')update(rotate(model,action==='left'?-1:1));
        if(action==='in'||action==='out')update(zoom(model,model.zoom+(action==='in' ? .2 : -.2)));
      });
      dialog.addEventListener('cancel',e=>{e.preventDefault();finish(null);});dialog.addEventListener('close',()=>finish(null));
      try{dialog.showModal();paint();if(!finished)stage.focus({preventScroll:true});}catch(error){finish(null,error);}
    });
  }
  window.LEXI_AVATAR_CROP={create,geometry,pan,zoom,pinch,rotate,draw,open,cancel};
})();
