/* Lexi: dependency-free, local-first vocabulary learning. */
(() => {
  'use strict';
  const $ = (s,root=document) => root.querySelector(s);
  const $$ = (s,root=document) => [...root.querySelectorAll(s)];
  const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const paths = {
    moon:'M21 13a9 9 0 1 1-10-10 7 7 0 0 0 10 10z',
    sun:'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5',
    monitor:'M3 4h18v13H3zM8 21h8M12 17v4',
    home:'M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
    grid:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
    repeat:'M20 7h-9a6 6 0 0 0-6 6v1M17 3l4 4-4 4M4 17h9a6 6 0 0 0 6-6v-1M7 21l-4-4 4-4',
    book:'M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1zM12 5v15',
    chart:'M4 3v18h17M8 16v-4M13 16V7M18 16V4',
    settings:'m9 3-1 3-3 1-2 3 2 3 1 3 3 1 1 3h4l1-3 3-1 2-3-2-3-1-3-3-1-1-3zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
    search:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    arrow:'M5 12h14M13 6l6 6-6 6', back:'M19 12H5M11 6l-6 6 6 6',
    calendar:'M4 5h16v16H4zM8 3v4M16 3v4M4 10h16M8 14h2M14 14h2',
    flame:'M12 2c1 5-3 6-3 10 0 2 1 3 2 4-1-5 4-5 4-9 4 4 6 7 4 11-1 3-4 4-7 4-5 0-8-4-7-8 0-4 4-7 7-12z',
    star:'m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z',
    target:'M21 12a9 9 0 1 1-9-9M17 3h4v4M12 12l9-9M16 12a4 4 0 1 1-4-4',
    volume:'M11 4 5 9H2v6h3l6 5zM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14',
    close:'m6 6 12 12M6 18 18 6',check:'m5 12 4 4L19 6',
    download:'M12 3v12M7 10l5 5 5-5M4 16v5h16v-5',upload:'M12 16V3M7 8l5-5 5 5M4 16v5h16v-5',
    bolt:'m14 2-9 12h7l-2 8 9-13h-7z',
    user:'M20 21v-2a7 7 0 0 0-14 0v2M17 7a5 5 0 1 1-10 0 5 5 0 0 1 10 0'
  };
  const icon = name => '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="'+(paths[name]||paths.star)+'"/></svg>';
  $$('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
  const topics=[...(window.LEXI_DATA?.topics||[]),...(window.LEXI_TOEIC_TOPICS||[])];
  const toeicTopics=topics.filter(t=>t.track==='toeic');
  const words=topics.flatMap(t=>t.words.map(w=>({...w,topic:t.id})));
  const synonymData=window.LEXI_SYNONYMS||{};
  const synonymEntries=w=>Array.isArray(synonymData[w.id])?synonymData[w.id]:[];
  const byId=new Map(words.map(w=>[w.id,w]));
  const topicById=new Map(topics.map(t=>[t.id,t]));
  const main=$('#main'), lesson=$('#lesson'), settings=$('#settings');
  $('.skip').addEventListener('click',e=>{e.preventDefault();main.focus();});
  if(!topics.length) { main.innerHTML='<div class="empty"><h1>Chưa tải được bộ từ vựng</h1><p>Hãy tải lại trang để thử lại.</p><button class="btn btn-primary" onclick="location.reload()">Tải lại</button></div>';return; }
  const STORAGE='lexi-progress-v1';
  let storageAvailable=true, offlineReady=false, installPrompt=null, session=null, toastTimer;
  let offlineMessage='Đang chuẩn bị bộ từ để học offline. Hãy giữ kết nối mạng trong lần mở đầu.';
  let filters={level:'all',query:'',saved:false,toeic:'all'};
  const defaultProfile=()=>window.LEXI_PROFILE?.defaults()||{nickname:'',avatar:'sprout',color:'lavender',image:null};
  const defaults=()=>({version:1,goal:10,progress:{},favorites:[],daily:{},lastTopic:null,profile:defaultProfile()});
  function validate(raw) {
    if(!raw||raw.version!==1) throw new Error('Invalid data');
    const next=defaults(),number=(n,max=1e6)=>typeof n==='number'&&Number.isFinite(n)&&n>=0?Math.floor(Math.min(n,max)):0;
    next.profile=window.LEXI_PROFILE?.validate(raw.profile)||defaultProfile();
    next.goal=[5,10,15,20].includes(raw.goal)?raw.goal:10;
    next.favorites=[...new Set(Array.isArray(raw.favorites)?raw.favorites.filter(id=>byId.has(id)):[])];
    if(topicById.has(raw.lastTopic)) next.lastTopic=raw.lastTopic;
    for(const [id,p] of Object.entries(raw.progress||{})) if(byId.has(id)&&p&&typeof p==='object') {
      next.progress[id]={seen:number(p.seen,10000),success:number(p.success,10000),interval:number(p.interval,60),due:number(p.due,Date.now()+366*86400000)};
    }
    for(const [date,d] of Object.entries(raw.daily||{}).slice(-366)) if(/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date+'T00:00:00Z'))&&new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date&&d&&typeof d==='object') {
      next.daily[date]={ids:[...new Set(Array.isArray(d.ids)?d.ids.filter(id=>byId.has(id)):[])],xp:number(d.xp,10000),correct:number(d.correct,10000),answers:number(d.answers,10000)};
    }
    return next;
  }
  let state=defaults(),localPresent=false,initialReadFailed=false,protection=null;
  let profileDraft=null,profileImageRequest=0,profilePhotoBusy=false;
  try { const raw=localStorage.getItem(STORAGE);if(raw){localPresent=true;state=validate(JSON.parse(raw));} } catch {storageAvailable=false;initialReadFailed=true;}
  function save(notify=true) {
    localPresent=true;
    try {localStorage.setItem(STORAGE,JSON.stringify(state));storageAvailable=true;}catch {storageAvailable=false;toast('Máy chưa lưu được tiến độ. Sao lưu tài khoản hoặc xuất tệp dự phòng ngay.');}
    if(notify)protection?.changed();else protection?.refresh();
  }
  function renderProtection(snapshot) {
    if(!protection)return;
    const info=snapshot||protection.snapshot();
    $$('[data-backup-panel]').forEach(el=>{
      const active=el.contains(document.activeElement)?document.activeElement?.dataset.backup:null;
      const oldHistory=el.querySelector('.backup-history'),historyOpen=oldHistory?.open,historyValue=el.querySelector('[data-backup-history]')?.value;
      const markup=window.LEXI_BACKUP.panel(info);
      if(el.innerHTML!==markup){
        el.innerHTML=markup;
        const history=el.querySelector('.backup-history'),select=el.querySelector('[data-backup-history]');
        if(history)history.open=!!historyOpen;
        if(select&&[...select.options].some(o=>o.value===historyValue))select.value=historyValue;
        if(active)el.querySelector('[data-backup="'+active+'"]')?.focus({preventScroll:true});
      }
    });
    const banner=$('#backup-banner');
    if(banner){banner.innerHTML=window.LEXI_BACKUP.banner(info);banner.dataset.status=info.status;banner.hidden=false;}
    const note=$('.local-note');if(note)note.innerHTML='<i></i>'+(info.status==='saved'?'Đã có bản sao tài khoản':info.enabled?'Sao lưu tài khoản · xem trạng thái':'Tiến độ trên máy · chưa sao lưu');
    paintProfileAccount(info);
  }
  function toast(message) {const el=$('#toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3600);}
  function dateKey(date=new Date()) {return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');}
  function dayAgo(n) {const d=new Date();d.setDate(d.getDate()-n);return d;}
  const today=()=>dateKey();
  const dayData=()=>state.daily[today()]||{ids:[],xp:0,correct:0,answers:0};
  const learned=()=>words.filter(w=>state.progress[w.id]?.seen>0);
  const mastered=()=>words.filter(w=>state.progress[w.id]?.interval>=7);
  const due=()=>words.filter(w=>state.progress[w.id]?.seen>0&&state.progress[w.id].due<=Date.now());
  const totalXP=()=>Object.values(state.daily).reduce((n,d)=>n+d.xp,0);
  const topicLearned=t=>t.words.filter(w=>state.progress[w.id]?.seen>0).length;
  function streak() {let n=0,i=dayData().ids.length?0:1;while(i<367&&state.daily[dateKey(dayAgo(i))]?.ids.length){n++;i++;}return n;}
  const shuffle=list=>{const a=[...list];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
  const isSaved=id=>state.favorites.includes(id);
  function favorite(id) {
    if(!byId.has(id))return;
    state.favorites=isSaved(id)?state.favorites.filter(x=>x!==id):[...state.favorites,id];save();
    $$('[data-favorite]').filter(b=>b.dataset.favorite===id).forEach(b=>{b.classList.toggle('saved',isSaved(id));b.setAttribute('aria-pressed',String(isSaved(id)));b.setAttribute('aria-label',isSaved(id)?'Bỏ lưu từ '+byId.get(id).word:'Lưu từ '+byId.get(id).word);});
  }
  const favoriteButton=id=>'<button class="icon-button '+(isSaved(id)?'saved':'')+'" data-favorite="'+esc(id)+'" aria-pressed="'+isSaved(id)+'" aria-label="'+esc((isSaved(id)?'Bỏ lưu từ ':'Lưu từ ')+byId.get(id).word)+'">'+icon('star')+'</button>';
  const speakerButton=(id,extra='')=>'<button class="icon-button speaker '+extra+'" data-speak="'+esc(id)+'" aria-label="Nghe phát âm '+esc(byId.get(id).word)+'">'+icon('volume')+'</button>';
  function award(id,grade,mode) {
    const p=state.progress[id]||{seen:0,success:0,interval:0,due:0};
    p.seen++;
    if(grade==='hard') {p.interval=0;p.due=Date.now()+10*60000;}
    else {p.success++;p.interval=grade==='ok'?1:Math.min(60,Math.max(3,p.interval*2||3));p.due=Date.now()+p.interval*86400000;}
    state.progress[id]=p;
    const d=state.daily[today()]||(state.daily[today()]={ids:[],xp:0,correct:0,answers:0});
    let xp=0;
    if(!d.ids.includes(id)) {d.ids.push(id);xp=mode==='quiz'?(grade==='hard'?0:5):10;d.xp+=xp;}
    if(mode==='quiz') {d.answers++;if(grade!=='hard')d.correct++;}
    save();return xp;
  }
  function updateNav(route) {
    const active=route==='topic'?'topics':route;
    $$('[data-nav]').forEach(a=>{const on=a.dataset.nav===active;a.classList.toggle('active',on);if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    const badge=$('#due-badge'),n=due().length;badge.hidden=!n;badge.textContent=n;
    $('#connection-status').textContent=offlineReady?'Sẵn sàng học offline':navigator.onLine?'Lexi · A2–C1':'Đang offline';
  }
  function pageHead(eyebrow,title,subtitle,aside='') {return '<div class="page-head"><div><div class="eyebrow">'+eyebrow+'</div><h1>'+title+'</h1><p>'+subtitle+'</p></div>'+aside+'</div>';}
  function paintIdentity(profile=state.profile){
    const api=window.LEXI_PROFILE;if(!api)return;
    const current=api.validate(profile),markup=api.avatar(current,36);
    $$('[data-profile-avatar]').forEach(el=>{if(el.innerHTML!==markup)el.innerHTML=markup;});
    $$('[data-profile-name]').forEach(el=>el.textContent=current.nickname||'Hồ sơ');
  }
  function paintProfileAccount(info=protection?.snapshot()){
    const el=$('[data-profile-account]');if(!el)return;
    el.textContent=info?.user?'Đang dùng tài khoản '+info.user.email:info?.enabled?'Đăng nhập để tiếp tục sao lưu hồ sơ.':'Hồ sơ đang lưu trên thiết bị này.';
  }
  function profileFeedback(message,error=false){const el=$('#profile-feedback');if(el){el.textContent=message;el.dataset.error=String(error);}}
  function paintProfileDraft(){
    const api=window.LEXI_PROFILE;if(!api||!profileDraft)return;
    if(route().name==='profile')paintIdentity(profileDraft);
    const preview=$('#profile-preview'),markup=api.avatar(profileDraft,112);if(preview&&preview.innerHTML!==markup)preview.innerHTML=markup;
    const name=$('#profile-preview-name');if(name)name.textContent=api.cleanName(profileDraft.nickname)||'Một người bạn của Lexi';
    const count=$('#nickname-count');if(count)count.textContent=Array.from(api.cleanName(profileDraft.nickname)).length+'/24 ký tự';
    $$('[data-profile-preset]').forEach(b=>{const on=!profileDraft.image&&b.dataset.profilePreset===profileDraft.avatar;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));});
    $$('[data-profile-color]').forEach(b=>{const on=b.dataset.profileColor===profileDraft.color;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));});
    const remove=$('[data-action="profile-remove-photo"]');if(remove)remove.hidden=!profileDraft.image;
    const saveButton=$('[data-profile-save]');if(saveButton){saveButton.disabled=profilePhotoBusy;saveButton.textContent=profilePhotoBusy?'Đang xử lý ảnh…':'Lưu hồ sơ';}
  }
  function renderProfile(){
    const api=window.LEXI_PROFILE;if(!api){main.innerHTML=pageHead('YOUR LITTLE CORNER','Chưa tải được hồ sơ.','Hãy mở lại Lexi khi có kết nối mạng để nhận đầy đủ bản cập nhật.');return;}
    if(!profileDraft)profileDraft=api.validate(state.profile);
    main.innerHTML=pageHead('MAKE THIS SPACE YOURS','Một góc nhỏ, rất là bạn.','Đặt biệt danh, chọn một gương mặt thân quen và làm mới không gian học mỗi ngày.')+
      '<div class="profile-layout"><section class="profile-editor panel"><form id="profile-form"><div class="profile-preview"><div id="profile-preview"></div><span class="eyebrow">YOUR WORDS. YOUR WORLD.</span><h2 id="profile-preview-name"></h2><p>Xem trước thay đổi. Bấm “Lưu hồ sơ” để áp dụng.</p></div><div class="profile-field"><label for="profile-nickname">Bạn muốn Lexi gọi mình là gì?</label><input id="profile-nickname" name="nickname" type="text" maxlength="48" autocomplete="nickname" placeholder="Ví dụ: Mèo chăm học" value="'+esc(profileDraft.nickname)+'" aria-describedby="nickname-count"><div class="profile-field-help"><span>Biệt danh trong Lexi · có thể để trống để dùng mặc định</span><span id="nickname-count"></span></div></div>'+
      '<fieldset class="profile-choice"><legend>Chọn avatar của bạn</legend><div class="avatar-grid">'+api.avatars.map(([id,emoji,label])=>'<button type="button" class="avatar-option" data-profile-preset="'+id+'" aria-label="Avatar '+esc(label)+'" aria-pressed="false"><span aria-hidden="true">'+emoji+'</span></button>').join('')+'</div></fieldset>'+
      '<fieldset class="profile-choice"><legend>Một màu yêu thích</legend><div class="avatar-colors">'+api.colors.map(([id,hex,label])=>'<button type="button" class="avatar-color" style="--swatch:'+hex+'" data-profile-color="'+id+'" aria-label="'+esc(label)+'" aria-pressed="false"></button>').join('')+'</div></fieldset>'+
      '<div class="profile-photo-actions"><button type="button" class="btn btn-outline" data-action="profile-upload">'+icon('upload')+' Chọn ảnh từ máy</button><button type="button" class="btn btn-ghost" data-action="profile-remove-photo" hidden>Bỏ ảnh đã chọn</button><input id="profile-photo" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden></div><p class="profile-photo-note">Ảnh tối đa 8 MB. Kéo, thu phóng và xoay để chọn vùng ảnh trước khi lưu. Bạn có thể dùng avatar có sẵn bất cứ lúc nào.</p><p id="profile-feedback" class="profile-feedback" role="status" aria-live="polite"></p><div class="profile-save-row"><button class="btn btn-primary" type="submit" data-profile-save>Lưu hồ sơ</button><button class="btn btn-ghost" type="button" data-action="profile-reset">Bỏ thay đổi</button></div></form></section>'+
      '<aside class="profile-aside"><section class="profile-learning panel"><span class="profile-spark" aria-hidden="true">✦</span><div class="eyebrow">A LITTLE MORE YOU, EVERY DAY</div><h2>Mỗi ngày thêm<br>một phiên bản mới.</h2><p>Biệt danh mới, tinh thần mới. Những từ bạn đã học vẫn luôn ở đây.</p><div class="profile-metrics"><div><strong>'+learned().length+'</strong><span>từ đã luyện</span></div><div><strong>'+streak()+'</strong><span>ngày liên tiếp</span></div><div><strong>'+totalXP()+'</strong><span>XP khám phá</span></div></div><a class="btn btn-secondary" href="#topics">Tiếp tục khám phá '+icon('arrow')+'</a></section><section class="profile-account panel"><h3>Hồ sơ đi cùng bạn</h3><p data-profile-account></p><p>Khi bật sao lưu, nickname và avatar được lưu cùng tiến độ trên tài khoản Lexi. Dùng cùng tài khoản ChatGPT để khôi phục trên thiết bị khác.</p><button class="text-link" type="button" data-action="backup-settings">Tài khoản & sao lưu '+icon('arrow')+'</button></section></aside></div>';
    paintProfileDraft();paintProfileAccount();
  }
  async function chooseProfilePhoto(file){
    if(!file||!profileDraft)return;
    const api=window.LEXI_PROFILE,token=++profileImageRequest;profilePhotoBusy=true;paintProfileDraft();profileFeedback('Đang đọc ảnh để căn chỉnh…');
    try{const image=await api.photo(file,{isCurrent:()=>token===profileImageRequest&&route().name==='profile'});if(token!==profileImageRequest||route().name!=='profile')return;if(image===null){profileFeedback('Đã hủy căn chỉnh. Avatar trước đó vẫn được giữ.');return;}profileDraft.image=image;profileFeedback('Ảnh đã sẵn sàng. Bấm “Lưu hồ sơ” để áp dụng.');}
    catch(error){if(token===profileImageRequest)profileFeedback(error.message||'Chưa xử lý được ảnh. Hãy chọn ảnh khác.',true);}
    finally{if(token===profileImageRequest){profilePhotoBusy=false;paintProfileDraft();}const input=$('#profile-photo');if(input)input.value='';}
  }
  function toeicCallout(){
    if(!toeicTopics.length)return '';
    return '<a class="toeic-callout" href="#toeic"><span class="toeic-symbol" aria-hidden="true">🎯</span><div><span class="eyebrow">YOUR NEXT MILESTONE</span><h2>TOEIC 400 → 800</h2><p>'+toeicTopics.reduce((n,t)=>n+t.words.length,0)+' từ & cụm từ · 5 mục tiêu · Học theo ngữ cảnh công việc</p></div><span class="toeic-callout-arrow">Khám phá '+icon('arrow')+'</span></a>';
  }
  function renderToeic(){
    const count=toeicTopics.reduce((n,t)=>n+t.words.length,0),done=toeicTopics.reduce((n,t)=>n+topicLearned(t),0);
    main.innerHTML=pageHead('ENGLISH FOR YOUR NEXT OPPORTUNITY','Từng bước đến mục tiêu TOEIC.','Từ nền tảng văn phòng đến cách diễn đạt trong hợp đồng. Chọn một mốc để bắt đầu.')+
      '<section class="toeic-intro"><div><span class="eyebrow">SMALL WORDS. BIG OPPORTUNITIES.</span><h2>400 · 500 · 600 · 700 · 800</h2><p>'+count+' từ và cụm từ mới, kèm phát âm, ví dụ Anh–Việt, cụm thường đi cùng và điểm dễ nhầm.</p><span class="toeic-progress">Đã luyện '+done+'/'+count+' từ</span></div><span class="toeic-intro-art" aria-hidden="true">🎯</span></section>'+
      '<p class="toeic-disclaimer">Các mốc là mục tiêu tổng điểm TOEIC Listening & Reading để sắp xếp việc ôn trong Lexi, không phải danh sách từ hay quy đổi CEFR chính thức của ETS. Nên học tích lũy từ mốc thấp; bộ từ không dự đoán hoặc bảo đảm điểm thi.</p>'+
      '<div class="topic-grid">'+toeicTopics.map(topicCard).join('')+'</div><div class="data-note">Ngữ cảnh tham khảo từ <a class="text-link" href="https://www.ets.org/pdfs/toeic/toeic-listening-reading-test-examinee-handbook.pdf" target="_blank" rel="noopener noreferrer">cẩm nang TOEIC của ETS</a>. Ví dụ và ghi chú do Lexi biên soạn, không sao chép câu hỏi đề thi. Các bài luyện trong app là luyện từ vựng, chưa phải đề thi TOEIC mô phỏng.</div>';
  }
  function toeicFilters(){
    const selected=filters.toeic||'all';
    return '<div class="toeic-filter"><span>Lộ trình từ vựng</span><div class="chips" aria-label="Lọc mục tiêu TOEIC">'+['all','toeic','400','500','600','700','800'].map(v=>'<button class="chip '+(selected===v?'active':'')+'" data-toeic-band="'+v+'" aria-pressed="'+(selected===v)+'">'+(v==='all'?'Toàn bộ thư viện':v==='toeic'?'TOEIC · tất cả':'Mục tiêu '+v)+'</button>').join('')+'</div></div>';
  }
  function renderUsage(w,example=true,open=false){
    if(!w.toeicTarget)return '';
    return '<details class="toeic-usage"'+(open?' open':'')+'><summary><span>TOEIC '+esc(w.toeicTarget)+' · '+esc(w.context)+'</span> Cụm từ & cách dùng</summary><div><p><b>Hay đi cùng</b> <span lang="en">'+esc(w.collocation)+'</span></p><p><b>Ghi nhớ</b> '+esc(w.usage)+'</p>'+(example?'<div class="toeic-example"><p lang="en">'+esc(w.example)+'</p><p>'+esc(w.translation)+'</p></div>':'')+'</div></details>';
  }
  function topicCard(t) {
    const n=topicLearned(t),pct=n/t.words.length*100;
    return '<a class="topic-card" href="#topic/'+esc(t.id)+'" aria-label="'+esc(t.title)+', '+t.words.length+' từ, đã học '+n+' từ"><div class="topic-card-top"><span class="topic-emoji" style="--tint:'+esc(t.color)+'">'+t.emoji+'</span><span class="level-tag">'+esc(t.level)+'</span></div><h3>'+esc(t.title)+'</h3><p class="english">'+esc(t.subtitle)+'</p><div class="topic-card-bottom"><span>'+t.words.length+' từ vựng</span><span class="card-progress"><span class="small-track"><i style="width:'+pct+'%"></i></span>'+n+'/'+t.words.length+'</span>'+icon('arrow')+'</div></a>';
  }
  function statsMarkup() {return '<div class="stats-row"><div class="stat"><span class="stat-icon">'+icon('flame')+'</span><div><strong>'+streak()+'<small>ngày</small></strong><p>Chuỗi ngày học</p></div></div><div class="stat"><span class="stat-icon">'+icon('book')+'</span><div><strong>'+learned().length+'<small>từ</small></strong><p>Từ vựng đã học</p></div></div><div class="stat"><span class="stat-icon">'+icon('bolt')+'</span><div><strong>'+totalXP()+'<small>XP</small></strong><p>Điểm khám phá</p></div></div></div>';}
  function renderHome() {
    const n=dayData().ids.length,pct=Math.min(100,n/state.goal*100),featured=words.find(w=>w.word==='resilient')||words[0];
    const weeks=Array.from({length:7},(_,i)=>{const d=dayAgo(6-i),key=dateKey(d),done=state.daily[key]?.ids.length;return '<span class="week-day '+(done?'done ':'')+(i===6?'today':'')+'"><span>'+['CN','T2','T3','T4','T5','T6','T7'][d.getDay()]+'</span><i>'+(done?'✓':'·')+'</i></span>';}).join('');
    const date=new Intl.DateTimeFormat('vi-VN',{weekday:'short',day:'numeric',month:'short'}).format(new Date());
    main.innerHTML=pageHead('MAKE ROOM FOR NEW WORDS','Chào '+esc(state.profile.nickname||'bạn')+', cùng học nhé <span aria-hidden="true">👋</span>','Một hành trình nhỏ hôm nay. Một vốn từ phong phú ngày mai.','<span class="date-chip">'+icon('calendar')+esc(date)+'</span>')+
    '<div class="dashboard-top"><section class="hero"><div class="hero-copy"><div class="eyebrow">LESS SCROLLING, MORE LEARNING</div><h2>Mỗi từ mới,<br>một <em>góc nhìn mới.</em></h2><p>Khám phá tiếng Anh qua những chủ đề bạn quan tâm. Chỉ 10 từ mỗi lần học.</p><button class="btn btn-primary" data-action="quick-learn">Bắt đầu học '+icon('arrow')+'</button></div><div class="hero-art" aria-hidden="true"><div class="art-circle"></div><div class="art-card back"></div><div class="art-card"><span class="art-tag">A WORD TO KEEP</span><strong class="art-word">'+esc(featured.word)+'</strong><span class="art-ipa">'+esc(featured.ipa)+'</span><span class="art-meaning">'+esc(featured.meaning)+'</span></div><span class="art-spark">✦</span><span class="art-sticker">a little progress, every day ✨</span></div></section><section class="goal-card"><div class="card-mini-head">Mục tiêu hôm nay '+icon('target')+'</div><div class="goal-ring"><svg viewBox="0 0 123 123" aria-hidden="true"><circle cx="61.5" cy="61.5" r="49"/><circle cx="61.5" cy="61.5" r="49" stroke-dasharray="307.88" stroke-dashoffset="'+(307.88*(1-pct/100))+'"/></svg><div class="ring-label"><strong>'+n+'<span> / '+state.goal+'</span></strong><small>từ đã luyện hôm nay</small></div></div><div class="week-days">'+weeks+'</div></section></div>'+statsMarkup()+toeicCallout()+
    '<section><div class="section-head"><div><h2>Chủ đề dành cho bạn</h2><p>Từ những điều gần gũi, đến những ý tưởng lớn.</p></div><a class="text-link" href="#topics">Xem tất cả '+icon('arrow')+'</a></div><div class="topic-grid">'+topics.slice(0,6).map(topicCard).join('')+'</div></section><div class="quote-strip"><span>✷</span><div><p>Một chút tập trung hôm nay. Thêm nhiều tự tin ngày mai.</p><small>Không cần học thật nhiều — chỉ cần quay lại đều đặn.</small></div><button class="btn btn-secondary" data-action="review">Ôn tập hôm nay '+icon('arrow')+'</button></div>';
  }
  function filtersMarkup(withSaved=false) {return '<div class="filter-bar"><div class="chips">'+['all','A2','B1','B2','C1'].map(v=>'<button class="chip '+(filters.level===v?'active':'')+'" data-filter="'+v+'" aria-pressed="'+(filters.level===v)+'">'+(v==='all'?'Tất cả trình độ':v)+'</button>').join('')+(withSaved?'<button class="chip '+(filters.saved?'active':'')+'" data-action="saved-filter" aria-pressed="'+filters.saved+'">☆ Đã lưu ('+state.favorites.length+')</button>':'')+'</div><label class="filter-search">'+icon('search')+'<input id="filter-input" type="search" placeholder="'+(withSaved?'Tìm từ, nghĩa tiếng Việt…':'Tìm chủ đề…')+'" value="'+esc(filters.query)+'" aria-label="'+(withSaved?'Tìm trong từ điển':'Tìm chủ đề')+'"></label></div>';}
  const normalize=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase();
  const dictionaryIndex=new Map(words.map(w=>[w.id,normalize(w.word+' '+w.meaning+' '+(w.context||'')+' '+(w.collocation||'')+' '+synonymEntries(w).map(s=>s.word+' '+s.meaning).join(' '))]));
  function renderSynonymPanel(w) {
    const entries=synonymEntries(w);if(!entries.length)return '';
    const q=normalize(filters.query);
    const matched=q&&!normalize(w.word+' '+w.meaning).includes(q)&&entries.some(s=>normalize(s.word+' '+s.meaning).includes(q));
    return '<details class="synonym-panel" data-synonyms="'+esc(w.id)+'"'+(matched?' open':'')+'><summary><span class="synonym-summary-icon">≈</span><span>Từ gần nghĩa & cách dùng <small>'+entries.length+' cách diễn đạt · so sánh sắc thái</small></span><span class="synonym-chevron" aria-hidden="true">⌄</span></summary><div class="synonym-content"></div></details>';
  }
  function populateSynonyms(panel) {
    if(!panel.open||panel.dataset.loaded)return;
    const w=byId.get(panel.dataset.synonyms);if(!w)return;
    const labels={near:'Gần nghĩa',paraphrase:'Cách diễn đạt',related:'Liên quan · khác nghĩa'};
    $('.synonym-content',panel).innerHTML='<p class="synonym-note">So với <strong lang="en">'+esc(w.word)+'</strong> trong nghĩa “'+esc(w.meaning)+'”. Cấp độ CEFR chỉ tham khảo; từ gần nghĩa không luôn thay thế được cho nhau.</p>'+synonymEntries(w).map((s,i)=>'<article class="synonym-entry"><div class="synonym-entry-head"><strong lang="en">'+esc(s.word)+'</strong><span class="synonym-level" title="Cấp độ CEFR tham khảo">'+esc(s.level)+'</span><span class="synonym-register">'+esc(s.register)+'</span><button class="icon-button" data-synonym-speak="'+esc(w.id)+'" data-synonym-index="'+i+'" aria-label="Nghe phát âm '+esc(s.word)+'">'+icon('volume')+'</button></div><div class="synonym-meaning">'+esc(s.meaning)+' <span class="synonym-relation '+esc(s.relation)+'">'+esc(labels[s.relation]||labels.related)+'</span></div><p class="synonym-distinction"><b>Phân biệt</b> '+esc(s.distinction)+'</p><p class="synonym-pattern"><b>Hay dùng</b> <span lang="en">'+esc(s.pattern)+'</span></p><div class="synonym-example"><p lang="en">'+esc(s.example)+'</p><p>'+esc(s.translation)+'</p></div></article>').join('');
    panel.dataset.loaded='true';
  }
  function hydrateSynonyms(root){$$('details[data-synonyms][open]',root).forEach(populateSynonyms);}
  document.addEventListener('toggle',e=>{if(e.target.matches?.('details[data-synonyms]'))populateSynonyms(e.target);},true);
  function topicResults() {const q=normalize(filters.query);return topics.filter(t=>(filters.level==='all'||t.words.some(w=>w.level===filters.level))&&normalize(t.title+' '+t.subtitle+' '+t.description).includes(q));}
  function renderTopics() {main.innerHTML=pageHead('FIND YOUR NEXT INTEREST','Một chủ đề, nhiều điều hay.',''+topics.length+' chủ đề · '+words.length+' từ và cụm từ A2–C1 · Học theo ngữ cảnh')+toeicCallout()+filtersMarkup()+'<div id="results" class="topic-grid"></div>';updateResults('topics');}
  function wordRow(w,i=0,examples=false) {
    const p=state.progress[w.id];
    return '<div class="word-item"><div class="word-row"><span class="word-number">'+String(i+1).padStart(2,'0')+'</span><div class="word-main"><div class="word-head"><strong lang="en">'+esc(w.word)+'</strong><small>'+esc(w.ipa)+'</small></div><p class="word-meaning">'+esc(w.meaning)+' <span style="color:#b0b8a8">· '+esc(w.pos)+'</span></p>'+(examples&&!w.toeicTarget?'<p class="word-example" lang="en">'+esc(w.example)+'</p>':'')+'</div><span class="word-status">'+(p?.interval>=7?'Đã vững':p?.seen?'Đang học':'Chưa học')+'</span><span class="level-tag">'+w.level+'</span>'+speakerButton(w.id)+favoriteButton(w.id)+'</div>'+renderUsage(w)+renderSynonymPanel(w)+'</div>';
  }
  function dictionaryResults() {const q=normalize(filters.query);return words.filter(w=>(!filters.toeic||filters.toeic==='all'||(filters.toeic==='toeic'?!!w.toeicTarget:String(w.toeicTarget)===filters.toeic))&&(filters.level==='all'||w.level===filters.level)&&(!filters.saved||isSaved(w.id))&&dictionaryIndex.get(w.id).includes(q));}
  function renderDictionary() {main.innerHTML=pageHead('YOUR WORD COLLECTION','Từ điển của bạn','Tra từ gốc hoặc từ gần nghĩa, so sánh cách dùng và lưu từ bạn muốn nhớ.')+'<div class="dict-summary"><span><strong>'+words.length+'</strong> từ gốc</span><span><strong>'+learned().length+'</strong> đã học</span><span><strong>'+state.favorites.length+'</strong> đã lưu</span><span><strong>'+Object.values(synonymData).reduce((n,a)=>n+a.length,0)+'</strong> mục so sánh</span></div>'+filtersMarkup(true)+toeicFilters()+'<div id="results"></div>';updateResults('dictionary');}
  function updateResults(type) {
    const list=type==='topics'?topicResults():dictionaryResults();
    const root=$('#results');if(!root)return;
    if(!list.length){root.className='';root.innerHTML='<div class="empty"><span class="empty-icon">🔎</span><h2>Chưa tìm thấy kết quả</h2><p>Thử từ khóa khác hoặc đổi bộ lọc trình độ nhé.</p><button class="btn btn-secondary" data-action="clear-filter">Xóa bộ lọc</button></div>';return;}
    root.className=type==='topics'?'topic-grid':'';
    root.innerHTML=type==='topics'?list.map(topicCard).join(''):'<div class="section-head"><p style="font-size:11px;color:var(--muted)">'+list.length+' kết quả</p></div><div class="word-list">'+list.map((w,i)=>wordRow(w,i)).join('')+'</div>';
    hydrateSynonyms(root);
  }
  function renderTopic(id) {
    const t=topicById.get(id);if(!t){location.hash='topics';return;}
    main.innerHTML='<div class="breadcrumb"><a href="#topics">Khám phá chủ đề</a> / <span>'+esc(t.title)+'</span></div><section class="topic-banner" style="--tint:'+esc(t.color)+'"><span class="big-emoji" aria-hidden="true">'+t.emoji+'</span><div><span class="level-tag">'+esc(t.level)+' · '+t.words.length+' TỪ VỰNG</span><h1 style="margin-top:8px">'+esc(t.title)+'</h1><p>'+esc(t.description)+'</p><div class="actions"><button class="btn btn-primary" data-learn="'+esc(id)+'">Học bằng thẻ '+icon('arrow')+'</button><button class="btn btn-outline" data-quiz="'+esc(id)+'">'+icon('bolt')+' Luyện tập</button></div></div></section><div class="section-head"><div><h2>Từ vựng trong chủ đề</h2><p>Đã luyện '+topicLearned(t)+'/'+t.words.length+' từ · Lưu từ bằng nút ngôi sao</p></div></div><div class="word-list">'+t.words.map((w,i)=>wordRow(byId.get(w.id),i,true)).join('')+'</div>';
  }
  function renderReview() {
    const list=due();
    main.innerHTML=pageHead('A LITTLE RECALL GOES A LONG WAY','Nhớ lâu hơn, từng lần ôn.','Các từ đến hạn sẽ xuất hiện ở đây để bạn ôn lại đúng lúc.')+(list.length?'<section class="review-callout"><span class="symbol">🧠</span><div><h2>'+list.length+' từ đang chờ bạn</h2><p>Ôn tối đa 10 từ mỗi phiên. Từ khó sẽ được nhắc lại sớm hơn.</p><button class="btn btn-primary" data-action="start-review">Bắt đầu ôn '+icon('arrow')+'</button></div></section><div class="word-list">'+list.map((w,i)=>wordRow(w,i)).join('')+'</div>':'<div class="empty"><span class="empty-icon">🌱</span><h2>'+ (learned().length?'Bạn đã ôn xong lúc này!':'Gieo những từ đầu tiên nhé')+'</h2><p>'+(learned().length?'Chưa có từ đến hạn. Từ “chưa nhớ” trở lại sau 10 phút; các từ khác sau 1–3 ngày và lâu hơn khi bạn nhớ tốt.':'Học một chủ đề bạn thích. Lexi sẽ lên lịch nhắc lại dựa trên mức độ bạn nhớ từ.')+'</p><a class="btn btn-primary" href="#topics">Khám phá chủ đề '+icon('arrow')+'</a></div>');
  }
  function renderProgress() {
    const days=Array.from({length:7},(_,i)=>{const d=dayAgo(6-i),n=state.daily[dateKey(d)]?.ids.length||0;return {label:['CN','T2','T3','T4','T5','T6','T7'][d.getDay()],n};}),max=Math.max(state.goal,...days.map(d=>d.n));
    main.innerHTML=pageHead('LOOK HOW FAR YOU HAVE COME','Những bước nhỏ, có ý nghĩa.','Theo dõi việc học và giữ một bản tiến độ ngoài thiết bị.')+statsMarkup()+'<div class="progress-grid"><section class="panel"><h2>Nhịp học 7 ngày qua</h2><p class="panel-subtitle">Số từ khác nhau đã luyện mỗi ngày</p><div class="activity-chart">'+days.map((d,i)=>'<div class="activity-day '+(i===6?'today':'')+'"><span>'+d.n+'</span><div class="bar-track"><i style="height:'+(d.n/max*100)+'%"></i></div><span>'+d.label+'</span></div>').join('')+'</div><div class="data-note">'+mastered().length+' từ đã có khoảng ôn từ 7 ngày trở lên. Tiến độ tăng khi bạn thực sự luyện, không chỉ khi mở thẻ.</div></section><section class="panel"><h2>Theo từng chủ đề</h2><p class="panel-subtitle">Từ đã luyện / tổng từ trong chủ đề</p>'+topics.map(t=>'<a class="topic-progress" href="#topic/'+t.id+'"><span class="topic-emoji" style="--tint:'+t.color+'">'+t.emoji+'</span><span class="name">'+esc(t.title)+'</span><span class="small-track"><i style="width:'+(topicLearned(t)/t.words.length*100)+'%"></i></span><small>'+topicLearned(t)+'/'+t.words.length+'</small></a>').join('')+'</section></div><section class="progress-protection" aria-label="Sao lưu và bảo vệ tiến độ"><div data-backup-panel></div></section>';
  }
  function route() {const bits=(location.hash.slice(1)||'home').split('/');return {name:bits[0],id:bits[1]};}
  function paintThemeControls(){
    const theme=window.LEXI_THEME;if(!theme)return;
    const dark=theme.getResolved()==='dark',label=dark?'Chuyển sang chế độ sáng':'Chuyển sang chế độ tối';
    $$('[data-action="toggle-theme"]').forEach(button=>{button.innerHTML=icon(dark?'sun':'moon');button.setAttribute('aria-label',label);button.title=label;button.setAttribute('aria-pressed',String(dark));});
    $$('[data-theme-choice]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.themeChoice===theme.getPreference())));
  }
  function changeTheme(value){
    const result=value?window.LEXI_THEME?.setPreference(value):window.LEXI_THEME?.toggle();
    if(result&&!result.saved)toast('Đã đổi giao diện trong phiên này; trình duyệt chưa cho lưu lựa chọn.');
  }
  document.addEventListener('lexi-theme-change',paintThemeControls);
  function render() {
    paintIdentity();paintThemeControls();
    const r=route();updateNav(r.name);
    ({home:renderHome,profile:renderProfile,topics:renderTopics,toeic:renderToeic,dictionary:renderDictionary,progress:renderProgress,review:renderReview,topic:()=>renderTopic(r.id)}[r.name]||renderHome)();
    document.title='Lexi — '+({home:'Hôm nay',profile:'Hồ sơ của bạn',topics:'Khám phá chủ đề',toeic:'TOEIC 400–800',dictionary:'Từ điển',progress:'Tiến độ',review:'Ôn tập',topic:topicById.get(r.id)?.title}[r.name]||'Học từ vựng');
    protection?.refresh();
  }
  function startSession(topicId,mode='learn') {
    const t=topicById.get(topicId);
    let pool=mode==='review'?due():t?words.filter(w=>w.topic===topicId):words;
    if(!pool.length){toast('Chưa có từ đến hạn để ôn. Hãy khám phá một chủ đề nhé.');return;}
    if(mode!=='quiz') pool=[...pool].sort((a,b)=>(state.progress[a.id]?.seen||0)-(state.progress[b.id]?.seen||0));
    else pool=shuffle(pool);
    const queue=pool.slice(0,10).map(w=>w.id);
    session={mode,topicId:topicId||null,queue,index:0,flipped:false,correct:0,xp:0,answered:false,choice:null,questions:[]};
    if(mode==='quiz') session.questions=queue.map((id,index)=>makeQuestion(id,index));
    if(t){state.lastTopic=t.id;save();}
    renderSession();lesson.showModal();focusLesson();
  }
  function focusLesson(){
    if(!lesson.open||!session)return;
    const selector=session.index>=session.queue.length?'[data-action="finish"]':session.mode==='quiz'?(session.answered?'[data-action="next"]':'[data-choice]'):session.flipped?'[data-grade]':'[data-action="flip"]';
    $(selector,lesson)?.focus({preventScroll:true});
  }
  function makeQuestion(id,index) {
    const w=byId.get(id),re=w.word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const match=new RegExp('\\b'+re+'\\b','i');
    const context=index%2===1&&match.test(w.example);
    const value=x=>context?x.word:x.meaning;
    const distractors=shuffle(words.filter(x=>x.id!==id&&value(x)!==value(w)));
    const unique=new Set([value(w)]),options=[id];
    for(const other of distractors){if(unique.has(value(other)))continue;unique.add(value(other));options.push(other.id);if(options.length===4)break;}
    return {context,prompt:context?w.example.replace(match,'________'):w.word,options:shuffle(options)};
  }
  function renderSession() {
    if(!session)return;
    const s=session,t=topicById.get(s.topicId);
    if(s.index>=s.queue.length){renderResult();return;}
    const w=byId.get(s.queue[s.index]);
    const head='<div class="lesson-head"><span class="topic-emoji" style="--tint:'+(t?.color||'#eee9ff')+'">'+(t?.emoji||'🌱')+'</span><div class="lesson-head-text"><h2 id="lesson-title">'+(s.mode==='quiz'?'Luyện tập':s.mode==='review'?'Ôn tập đúng lúc':'Học bằng thẻ')+(t?' · '+esc(t.title):'')+'</h2><p>Từ '+(s.index+1)+' / '+s.queue.length+' · '+esc(w.level)+'</p></div><button class="icon-button" data-action="close-lesson" aria-label="Đóng bài học">'+icon('close')+'</button></div><div class="lesson-track"><i style="width:'+(s.index/s.queue.length*100)+'%"></i></div>';
    let content;
    if(s.mode==='quiz') {
      const q=s.questions[s.index];
      content='<p class="quiz-prompt">'+(q.context?'Chọn từ phù hợp với ngữ cảnh':'Chọn nghĩa đúng của từ')+'</p><h3 class="'+(q.context?'quiz-context':'quiz-title')+'" lang="en">'+esc(q.prompt)+'</h3><div class="choices">'+q.options.map((id,i)=>{const correct=s.answered&&id===w.id,wrong=s.answered&&s.choice===id&&id!==w.id;return '<button class="choice '+(correct?'correct':wrong?'wrong':'')+'" data-choice="'+id+'" '+(s.answered?'disabled':'')+'><b>'+(i+1)+'</b><span>'+esc(q.context?byId.get(id).word:byId.get(id).meaning)+'</span></button>';}).join('')+'</div>'+(s.answered?'<div class="quiz-feedback"><strong>'+(s.choice===w.id?'Chính xác! ✨':'Chưa đúng — mình cùng nhớ lại nhé.')+'</strong>'+esc(w.word)+' · '+esc(w.meaning)+'<p style="margin-top:5px" lang="en">'+esc(w.example)+'</p><p style="margin-top:4px">'+esc(w.translation)+'</p>'+renderUsage(w,false,true)+'</div><div class="lesson-bottom"><button class="btn btn-primary" data-action="next">'+(s.index===s.queue.length-1?'Xem kết quả':'Câu tiếp theo')+' '+icon('arrow')+'</button></div>':'')+'<p class="session-foot">Phím 1–4 để chọn · Enter để tiếp tục</p>';
    } else {
      content='<div class="flashcard"><div class="flash-top"><span class="level-tag">'+esc(w.level)+' · '+esc(w.pos)+'</span>'+favoriteButton(w.id)+'</div><h3 lang="en">'+esc(w.word)+'</h3><p class="ipa">'+esc(w.ipa)+'</p>'+speakerButton(w.id)+(s.flipped?'<div class="card-meaning">'+esc(w.meaning)+'</div><div class="example-block"><p lang="en">'+esc(w.example)+'</p><p>'+esc(w.translation)+'</p></div>'+renderUsage(w,false,true)+renderSynonymPanel(w):'<p class="flip-hint">Lật thẻ để xem nghĩa, từ gần nghĩa và cách dùng.</p>')+'</div><div class="lesson-bottom">'+(s.flipped?'<div class="grade-actions"><button class="grade hard" data-grade="hard">Chưa nhớ <small>1 · Ôn sau 10 phút</small></button><button class="grade ok" data-grade="ok">Cần ôn thêm <small>2 · Ôn sau 1 ngày</small></button><button class="grade good" data-grade="good">Đã nhớ <small>3 · Ôn sau '+Math.min(60,Math.max(3,(state.progress[w.id]?.interval||0)*2))+' ngày</small></button></div>':'<button class="btn btn-primary" data-action="flip">Xem nghĩa '+icon('arrow')+'</button>')+'</div><p class="session-foot">Space để lật thẻ · 1 / 2 / 3 để đánh giá khi đã lật</p>';
    }
    lesson.innerHTML='<div class="lesson-shell">'+head+content+'</div>';
    hydrateSynonyms(lesson);
    focusLesson();
  }
  function renderResult() {
    const s=session;
    lesson.innerHTML='<div class="lesson-shell"><div class="lesson-head"><h2 id="lesson-title" style="flex:1">Một bước tiến nữa!</h2><button class="icon-button" data-action="close-lesson" aria-label="Đóng kết quả">'+icon('close')+'</button></div><div class="session-result"><div class="result-emoji">'+(s.mode==='quiz'&&s.correct<s.queue.length/2?'🌱':'🎉')+'</div><h2>'+ (s.mode==='quiz'?'Bạn đã hoàn thành bài luyện!':'Từng từ nhỏ, tiến bộ lớn.')+'</h2><p>'+ (s.mode==='quiz'?'Đọc lại những câu ví dụ để nhớ cách dùng từ trong ngữ cảnh nhé.':'Các từ vừa học đã được lên lịch ôn. Bạn không cần nhớ tất cả ngay hôm nay.')+'</p><div class="result-stats"><div><strong>'+s.queue.length+'</strong><span>Từ đã luyện</span></div>'+(s.mode==='quiz'?'<div><strong>'+s.correct+'/'+s.queue.length+'</strong><span>Câu chính xác</span></div>':'')+'<div><strong>+'+s.xp+'</strong><span>XP nhận được</span></div></div><div class="lesson-bottom"><button class="btn btn-primary" data-action="finish">Về không gian học tập '+icon('arrow')+'</button><button class="btn btn-secondary" data-action="again">Luyện thêm một phiên</button></div></div></div>';
    focusLesson();
  }
  function closeLesson(){lesson.close();session=null;if('speechSynthesis'in window)speechSynthesis.cancel();render();main.focus({preventScroll:true});}
  function grade(value) {if(!session||session.mode==='quiz'||!session.flipped)return;session.xp+=award(session.queue[session.index],value,session.mode);next();}
  function chooseAnswer(id) {if(!session||session.mode!=='quiz'||session.answered)return;const s=session,wid=s.queue[s.index];s.choice=id;s.answered=true;if(id===wid)s.correct++;s.xp+=award(wid,id===wid?'good':'hard','quiz');renderSession();}
  function next(){if(!session)return;session.index++;session.flipped=false;session.answered=false;session.choice=null;renderSession();}
  lesson.addEventListener('cancel',()=>{session=null;render();if('speechSynthesis'in window)speechSynthesis.cancel();});
  let voices=[];
  function loadVoices(){if('speechSynthesis'in window)voices=speechSynthesis.getVoices().filter(v=>/^en(?:-|_)/i.test(v.lang));}
  if('speechSynthesis'in window){loadVoices();speechSynthesis.addEventListener('voiceschanged',loadVoices);}
  function speak(id){
    const w=byId.get(id);if(w)speakText(w.word);
  }
  function speakText(text){
    if(!text)return;
    if(!('speechSynthesis'in window)){toast('Trình duyệt chưa hỗ trợ phát âm. Bạn vẫn có thể đọc phiên âm IPA.');return;}
    loadVoices();const voice=voices.find(v=>v.localService&&/^en-US/i.test(v.lang))||voices.find(v=>v.localService)||voices.find(v=>/^en-US/i.test(v.lang))||voices[0];
    if(!navigator.onLine&&(!voice||!voice.localService)){toast('Chưa có giọng tiếng Anh offline trên thiết bị. Hãy kết nối mạng hoặc thêm giọng đọc trong cài đặt thiết bị.');return;}
    speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);if(voice)u.voice=voice;u.lang=voice?.lang||'en-US';u.rate=.85;u.onerror=e=>{if(!['canceled','interrupted'].includes(e.error))toast('Chưa phát được âm thanh. Hãy kiểm tra âm lượng hoặc giọng đọc tiếng Anh của thiết bị.');};speechSynthesis.speak(u);
  }
  function showSettings(){
    settings.innerHTML='<div class="settings-shell"><div class="settings-head"><h2 id="settings-title">Góc nhỏ của bạn</h2><button class="icon-button" data-action="close-settings" aria-label="Đóng cài đặt">'+icon('close')+'</button></div><section class="settings-section"><h3>Giao diện</h3><div class="theme-options" role="group" aria-label="Chọn giao diện"><button type="button" class="theme-option" data-theme-choice="light" aria-pressed="false">'+icon('sun')+'<span>Sáng</span></button><button type="button" class="theme-option" data-theme-choice="dark" aria-pressed="false">'+icon('moon')+'<span>Tối</span></button><button type="button" class="theme-option" data-theme-choice="system" aria-pressed="false">'+icon('monitor')+'<span>Hệ thống</span></button></div><p class="theme-note">Lưu riêng trên thiết bị này. Chế độ Hệ thống tự đổi theo giao diện máy.</p></section><section class="settings-section"><div data-backup-panel></div></section><section class="settings-section"><h3>Nhịp học vừa sức</h3><label>Mục tiêu mỗi ngày <select id="daily-goal">'+[5,10,15,20].map(n=>'<option '+(n===state.goal?'selected':'')+' value="'+n+'">'+n+' từ / ngày</option>').join('')+'</select></label><p style="margin-top:10px">Thư viện tổng quát B1–C1 và bộ TOEIC mục tiêu 400–800, có thêm từ nền tảng A2. Bạn có thể lọc trình độ trong Chủ đề và Từ điển.</p></section><section class="settings-section"><h3>Cài Lexi trên PC hoặc iPhone</h3><p>Mở như một ứng dụng, học nhanh hơn mỗi ngày.</p>'+(installPrompt?'<button class="btn btn-primary" data-action="install">'+icon('download')+' Cài ứng dụng</button>':'')+'<div class="install-device"><strong>Trên iPhone</strong><ol><li>Mở link Lexi trong Safari.</li><li>Chọn Chia sẻ → Thêm vào Màn hình chính.</li><li>Bật “Mở dưới dạng ứng dụng web” nếu có, rồi chọn Thêm.</li></ol></div><div class="install-device"><strong>Trên PC</strong><p>Mở bằng Chrome hoặc Edge, chọn biểu tượng cài ứng dụng ở thanh địa chỉ hoặc “Cài đặt trang dưới dạng ứng dụng” trong menu trình duyệt.</p></div></section><section class="settings-section"><h3>Học offline & phát âm</h3><p id="offline-detail">'+(offlineReady?'Đã lưu bộ từ và giao diện để học offline sau lần mở này.':offlineMessage)+'</p><p>Giọng phát âm do thiết bị cung cấp. Một số giọng cần mạng; ưu tiên giọng tiếng Anh đã tải trên máy.</p></section><p class="privacy-note">Bạn có thể học không cần tài khoản. Tiến độ chỉ được gửi lên máy chủ Lexi khi bạn bật sao lưu.</p></div>';
    paintThemeControls();protection?.refresh();settings.showModal();
  }
  function exportData(){const blob=new Blob([JSON.stringify({app:'lexi',...state},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='lexi-tien-do-'+today()+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Đã yêu cầu tải tệp dự phòng. Hãy kiểm tra thư mục tải về.');}
  async function shareBackup(){
    const file=new File([JSON.stringify({app:'lexi',...state},null,2)],'lexi-tien-do-'+today()+'.json',{type:'application/json'});
    if(!navigator.share||!navigator.canShare?.({files:[file]})){exportData();return;}
    try{await navigator.share({files:[file],title:'Bản sao tiến độ Lexi'});toast('Đã chia sẻ tệp. Nếu chọn Lưu vào Tệp, hãy kiểm tra vị trí bạn vừa chọn.');}
    catch(error){if(error.name!=='AbortError'){exportData();}}
  }
  function importData(){const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.addEventListener('change',async()=>{const f=input.files?.[0];if(!f)return;if(f.size>2e6){toast('Tệp quá lớn. Hãy chọn bản sao JSON do Lexi xuất.');return;}try{const raw=JSON.parse(await f.text());if(raw.app!=='lexi')throw new Error();const valid=validate(raw);if(!confirm('Thay thế tiến độ trên thiết bị này bằng bản sao đã chọn?'))return;state=valid;profileDraft=null;window.LEXI_AVATAR_CROP?.cancel();profileImageRequest++;profilePhotoBusy=false;initialReadFailed=false;save();if(settings.open)settings.close();render();toast('Đã khôi phục tiến độ học.');}catch{toast('Bản sao không hợp lệ. Hãy dùng tệp JSON được xuất từ Lexi.');}});input.click();}
  document.addEventListener('click',async e=>{
    if(e.target.closest('a[data-backup-signout]')){if(!protection?.prepareSignOut())e.preventDefault();return;}
    const button=e.target.closest('button');if(!button)return;
    const d=button.dataset;
    if(d.themeChoice){changeTheme(d.themeChoice);return;}
    if(d.backup){
      if(!protection)return;
      if(d.backup==='history'){const select=button.closest('[data-backup-panel]')?.querySelector('[data-backup-history]');protection.restoreHistorical(Number(select?.value));return;}
      ({connect:()=>protection.connect(),sync:()=>protection.sync(true),pause:()=>protection.pause(),restore:()=>protection.restore(),local:()=>protection.chooseLocal(),persist:()=>protection.checkPersistence(true)})[d.backup]?.();return;
    }
    if(d.profilePreset){window.LEXI_AVATAR_CROP?.cancel();profileImageRequest++;profilePhotoBusy=false;profileDraft.avatar=d.profilePreset;profileDraft.image=null;paintProfileDraft();profileFeedback('Bấm “Lưu hồ sơ” để áp dụng.');return;}
    if(d.profileColor){profileDraft.color=d.profileColor;paintProfileDraft();profileFeedback('Bấm “Lưu hồ sơ” để áp dụng.');return;}
    if(d.toeicBand){filters.toeic=d.toeicBand;filters.level='all';renderDictionary();return;}
    if(d.synonymSpeak){const term=synonymData[d.synonymSpeak]?.[Number(d.synonymIndex)];if(term)speakText(term.word);return;}
    if(d.speak){speak(d.speak);return;}if(d.favorite){favorite(d.favorite);if(route().name==='dictionary'&&filters.saved&&!lesson.open)updateResults('dictionary');return;}
    if(d.learn){startSession(d.learn);return;}if(d.quiz){startSession(d.quiz,'quiz');return;}if(d.grade){grade(d.grade);return;}if(d.choice){chooseAnswer(d.choice);return;}
    if(d.filter){filters.level=d.filter;render();return;}
    switch(d.action){
      case 'toggle-theme':changeTheme();break;
      case 'profile-upload':$('#profile-photo')?.click();break;
      case 'profile-remove-photo':window.LEXI_AVATAR_CROP?.cancel();profileImageRequest++;profilePhotoBusy=false;profileDraft.image=null;paintProfileDraft();profileFeedback('Bấm “Lưu hồ sơ” để áp dụng.');break;
      case 'profile-reset':window.LEXI_AVATAR_CROP?.cancel();profileImageRequest++;profilePhotoBusy=false;profileDraft=window.LEXI_PROFILE.validate(state.profile);$('#profile-nickname').value=profileDraft.nickname;paintProfileDraft();profileFeedback('Đã trở về hồ sơ đang lưu.');break;
      case 'quick-learn':startSession(state.lastTopic||topics[0].id);break;
      case 'settings':case 'backup-settings':showSettings();break;case 'close-settings':settings.close();break;
      case 'review':location.hash='review';break;case 'start-review':startSession(null,'review');break;
      case 'flip':if(session){session.flipped=true;renderSession();}break;
      case 'close-lesson':case 'finish':closeLesson();break;
      case 'again':{const s=session;closeLesson();startSession(s.topicId,s.mode);break;}
      case 'next':if(session?.answered)next();break;
      case 'saved-filter':filters.saved=!filters.saved;renderDictionary();break;
      case 'clear-filter':filters={level:'all',query:'',saved:false};render();break;
      case 'export':exportData();break;case 'import':importData();break;case 'share-backup':shareBackup();break;
      case 'install':if(installPrompt){await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;toast('Nếu đã chọn cài, Lexi sẽ có trong danh sách ứng dụng.');}break;
    }
  });
  document.addEventListener('input',e=>{if(e.target.id==='profile-nickname'&&profileDraft){profileDraft.nickname=e.target.value;paintProfileDraft();profileFeedback('');}if(e.target.id==='filter-input'){filters.query=e.target.value;updateResults(route().name);}});
  document.addEventListener('change',e=>{if(e.target.id==='profile-photo'){chooseProfilePhoto(e.target.files?.[0]);return;}if(e.target.id==='daily-goal'){state.goal=Number(e.target.value);save();render();toast('Đã cập nhật mục tiêu mỗi ngày.');}});
  document.addEventListener('submit',e=>{
    if(e.target.id!=='profile-form')return;e.preventDefault();if(profilePhotoBusy||!profileDraft)return;
    const api=window.LEXI_PROFILE,nickname=api.cleanName($('#profile-nickname').value);
    if(Array.from(nickname).length>24){profileFeedback('Biệt danh tối đa 24 ký tự nhé.',true);$('#profile-nickname').focus();return;}
    profileDraft.nickname=nickname;state.profile=api.validate(profileDraft);save();paintIdentity();paintProfileDraft();
    profileFeedback(storageAvailable?'Đã lưu hồ sơ trên máy.'+(protection?.snapshot().enabled?' Bản mới đang được kiểm tra để sao lưu.':' Bật sao lưu để giữ hồ sơ khi đổi thiết bị.'):'Máy chưa lưu được hồ sơ. Hãy sao lưu tài khoản hoặc xuất tệp dự phòng.',!storageAvailable);
  });
  $('#global-search').addEventListener('submit',e=>{e.preventDefault();filters={level:'all',query:$('#search-input').value.trim(),saved:false};if(route().name==='dictionary')renderDictionary();else location.hash='dictionary';$('#search-input').blur();});
  document.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#search-input').focus();return;}
    if(/INPUT|TEXTAREA|SELECT|SUMMARY/.test(e.target.tagName))return;
    if(!session||!lesson.open)return;
    if(session.index>=session.queue.length)return;
    if(session.mode==='quiz'){
      if(/^[1-4]$/.test(e.key)&&!session.answered){e.preventDefault();chooseAnswer(session.questions[session.index].options[Number(e.key)-1]);}
      else if(e.key==='Enter'&&session.answered&&e.target.tagName!=='BUTTON'){e.preventDefault();next();}
    }else{
      if(e.code==='Space'&&e.target.tagName!=='BUTTON'){e.preventDefault();if(!session.flipped){session.flipped=true;renderSession();}}
      if(session.flipped&&/^[1-3]$/.test(e.key)){e.preventDefault();grade(['hard','ok','good'][Number(e.key)-1]);}
    }
  });
  window.addEventListener('hashchange',()=>{window.LEXI_AVATAR_CROP?.cancel();profileImageRequest++;profilePhotoBusy=false;filters={level:'all',query:route().name==='dictionary'?filters.query:'',saved:false};render();window.scrollTo({top:0});});
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;});
  window.addEventListener('online',()=>updateNav(route().name));window.addEventListener('offline',()=>updateNav(route().name));
  function offlineStatus(message){
    offlineMessage=message;const label=$('#offline-detail');if(label)label.textContent=message;
  }
  async function prepareOffline(){
    if(!('serviceWorker'in navigator)){offlineStatus('Trình duyệt hiện tại chưa hỗ trợ học offline. Bạn vẫn có thể học khi có mạng.');return;}
    if(!isSecureContext){offlineStatus('Mở Lexi bằng link HTTPS để cài ứng dụng và chuẩn bị nội dung offline.');return;}
    try{
      await navigator.serviceWorker.register('./sw.js');
      const registration=await Promise.race([navigator.serviceWorker.ready,new Promise(resolve=>setTimeout(()=>resolve(null),15000))]);
      const worker=registration?.active;
      if(!worker){offlineStatus('Chưa lưu đủ nội dung offline. Giữ kết nối và mở lại app để thử lại.');return;}
      const channel=new MessageChannel();
      const timeout=setTimeout(()=>{channel.port1.close();offlineStatus('Chưa xác nhận được nội dung offline. Hãy mở lại app khi có mạng.');},5000);
      channel.port1.onmessage=e=>{if(e.data?.type==='APP_READY'){
        clearTimeout(timeout);offlineReady=!!e.data.ready;updateNav(route().name);
        offlineStatus(offlineReady?'Đã lưu bộ từ và giao diện để học offline sau lần mở này.':'Chưa lưu đủ nội dung offline. Hãy kết nối mạng và mở lại app.');
        channel.port1.close();
      }};
      worker.postMessage({type:'APP_READY'},[channel.port2]);
    }catch{offlineStatus('Chưa thể lưu nội dung offline trong trình duyệt này. Bạn vẫn có thể học khi có mạng.');}
  }
  if(window.LEXI_BACKUP){
    protection=window.LEXI_BACKUP.create({
      read:()=>state,validate,hasLocal:()=>localPresent,initialError:()=>initialReadFailed,
      localAvailable:()=>storageAvailable,canRestore:()=>!lesson.open,
      replace:raw=>{state=validate(raw);profileDraft=null;window.LEXI_AVATAR_CROP?.cancel();profileImageRequest++;profilePhotoBusy=false;initialReadFailed=false;const goalControl=$('#daily-goal');if(goalControl)goalControl.value=String(state.goal);save(false);render();},
      confirm:message=>confirm(message),toast,onStatus:renderProtection
    });
    window.addEventListener('online',()=>protection.resume());
    window.addEventListener('focus',()=>protection.resume());
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')protection.resume();else protection.sync();});
    window.addEventListener('pagehide',()=>protection.sync());
  }
  const resumeBackup=new URLSearchParams(location.search).get('backup')==='connect';
  const accountReturn=new URLSearchParams(location.search).get('backup')==='account';
  render();prepareOffline();
  if(accountReturn){protection?.signedOut();protection?.checkPersistence();}else protection?.start(resumeBackup);
  if(resumeBackup||accountReturn){
    showSettings();history.replaceState(null,'',location.pathname+location.hash);
  }
})();
