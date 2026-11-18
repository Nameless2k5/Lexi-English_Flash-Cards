/* Lexi progress protection. Cloud writes require an authenticated, successful read first. */
(() => {
  'use strict';
  const META_KEY='lexi-backup-v1';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const canonical=value=>{
    if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
    if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
    return JSON.stringify(value);
  };
  const count=s=>Object.values(s?.progress||{}).filter(p=>p.seen>0).length;
  const stamp=value=>{const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString('vi-VN',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit',year:'numeric'}):'chưa xác định';};
  async function digest(state){
    const value=canonical(state);
    if(!globalThis.crypto?.subtle)return 'plain:'+value;
    const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
    return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');
  }
  function create(hooks,environment={}) {
    const env={fetch:(...args)=>fetch(...args),online:()=>navigator.onLine!==false,storage:()=>localStorage,digest,...environment};
    let meta={enabled:false,userId:null,ackHash:null,pendingHash:null,revision:0,lastBackupAt:null};
    try{const raw=JSON.parse(env.storage().getItem(META_KEY)||'null');if(raw&&typeof raw==='object')meta={...meta,...raw,enabled:raw.enabled===true};}catch{/* Cloud recovery is still available with a new sign-in. */}
    let view={status:meta.enabled?'checking':'off',user:null,remote:null,history:[],message:'',persistent:'checking',localSaved:hooks.localAvailable(),lastBackupAt:meta.lastBackupAt};
    let verified=false,blocked=false,remote=null,knownUser=null,busy=null,timer=null,changes=0,retry=0,lastCheck=0,epoch=0;
    const live=token=>meta.enabled&&token===epoch;
    function remember(){try{env.storage().setItem(META_KEY,JSON.stringify(meta));}catch{/* Current cloud acknowledgement remains valid in memory. */}}
    function update(status,message=''){view={...view,status,message,lastBackupAt:meta.lastBackupAt,localSaved:hooks.localAvailable()};hooks.onStatus?.(snapshot());}
    function snapshot(){return {...view,lastBackupAt:knownUser?.id===meta.userId?meta.lastBackupAt:null,enabled:meta.enabled,busy:!!busy,localCount:count(hooks.read()),remote:remote?{revision:remote.revision,updatedAt:remote.updatedAt,count:count(remote.state)}:null};}
    function later(delay=900){clearTimeout(timer);if(meta.enabled&&!blocked)timer=setTimeout(()=>sync(),delay);}
    function acknowledge(hash,revision,updatedAt){meta={...meta,enabled:true,userId:knownUser.id,ackHash:hash,pendingHash:null,revision,lastBackupAt:updatedAt};remember();view.user=knownUser;retry=0;}
    function conflict(message){blocked=true;update('conflict',message||'Máy này và tài khoản có hai bản tiến độ khác nhau. Chọn bản muốn tiếp tục dùng.');}
    async function request(method,body,url='/api/backup'){
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
      try{
        const encoded=body?JSON.stringify(body):null;
        // Best effort when leaving the app; a positive response is still required for "saved".
        const keepalive=encoded!==null&&new TextEncoder().encode(encoded).byteLength<60000;
        const response=await env.fetch(url,{method,credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:body?{'Content-Type':'application/json'}:{'Accept':'application/json'},...(body?{body:encoded,keepalive}:{})});
        let json;try{json=await response.json();}catch{throw new Error('Máy chủ chưa trả về bản sao hợp lệ.');}
        return {response,json};
      }finally{clearTimeout(timeout);}
    }
    function authRequired(){verified=false;blocked=false;knownUser=null;remote=null;view.user=null;view.history=[];update('signin','Đăng nhập để giữ một bản tiến độ ngoài iPhone.');}
    function failed(){verified=false;if(!env.online())update('offline','Đang offline. Thay đổi mới đang chờ sao lưu khi có mạng.');else update('error','Chưa nhận được xác nhận sao lưu. Tiến độ mới vẫn cần được sao lưu.');retry++;later(Math.min(120000,5000*2**Math.min(retry,5)));}
    async function readRemote(token){
      update('checking','Đang kiểm tra bản sao trên tài khoản…');
      const {response,json}=await request('GET',undefined,'/api/backup?history=1');lastCheck=Date.now();
      if(!live(token))return false;
      if(response.status===401){authRequired();return false;}
      if(!response.ok)throw new Error('Backup unavailable');
      if(!json.user||typeof json.user.id!=='string'||typeof json.user.email!=='string')throw new Error('Invalid identity');
      knownUser={id:json.user.id,email:json.user.email};view.user=knownUser;
      view.history=(Array.isArray(json.history)?json.history:[]).filter(h=>Number.isSafeInteger(h.revision)&&h.revision>0&&Number.isFinite(Date.parse(h.updatedAt))&&Number.isSafeInteger(h.learned)&&h.learned>=0).slice(0,10);
      remote=null;
      if(json.backup!==null){
        const b=json.backup;
        if(!b||!Number.isSafeInteger(b.revision)||b.revision<1||!Number.isFinite(Date.parse(b.updatedAt)))throw new Error('Invalid backup');
        const state=hooks.validate(b.state),hash=await env.digest(state);if(!live(token))return false;
        remote={revision:b.revision,updatedAt:b.updatedAt,state,hash};
      }
      verified=true;return true;
    }
    async function applyRemote(token){
      if(!remote||!live(token))return;
      if(!hooks.canRestore()){conflict('Đã tìm thấy bản sao. Hãy đóng bài học đang mở trước khi khôi phục.');return;}
      hooks.replace(remote.state);changes++;
      acknowledge(remote.hash,remote.revision,remote.updatedAt);blocked=false;
      update('saved','Đã khôi phục bản sao và giữ tiến độ trên tài khoản.');hooks.toast?.('Đã khôi phục tiến độ từ tài khoản.');
    }
    async function reconcile(token){
      const generation=changes,localHash=await env.digest(hooks.read()),sameUser=!meta.userId||meta.userId===knownUser.id;
      if(!live(token))return false;
      if(!sameUser&&hooks.hasLocal()){conflict('Bạn đang dùng tài khoản khác. Chọn rõ bản tiến độ trước khi sao lưu để tránh trộn dữ liệu.');return false;}
      if(remote){
        if(!hooks.hasLocal()&&!hooks.initialError()){await applyRemote(token);return false;}
        if(localHash===remote.hash){acknowledge(remote.hash,remote.revision,remote.updatedAt);blocked=false;if(generation!==changes)return true;update('saved');return false;}
        if(sameUser&&meta.userId===knownUser.id&&(remote.hash===meta.ackHash||remote.hash===meta.pendingHash)&&!hooks.initialError()){
          acknowledge(remote.hash,remote.revision,remote.updatedAt);blocked=false;return true;
        }
        conflict();return false;
      }
      if(hooks.initialError()){conflict('Chưa đọc được tiến độ cũ trên máy. Hãy nhập tệp dự phòng hoặc chọn rõ bản muốn sao lưu.');return false;}
      blocked=false;return true;
    }
    async function upload(token){
      if(!verified||blocked||!knownUser||!live(token))return;
      const captured=hooks.validate(hooks.read()),generation=changes,hash=await env.digest(captured),baseRevision=remote?.revision||0;
      if(!live(token))return;
      if(remote?.hash===hash){acknowledge(hash,baseRevision,remote.updatedAt);if(generation===changes)update('saved');else{update('pending','Thay đổi mới đang chờ sao lưu.');later(100);}return;}
      // Record the attempt before sending, so a lost response can be reconciled on restart.
      meta.userId=knownUser.id;meta.pendingHash=hash;remember();update('saving','Đang sao lưu tiến độ…');
      const {response,json}=await request('PUT',{userId:knownUser.id,baseRevision,state:captured});
      if(!live(token))return;
      if(response.status===401){authRequired();return;}
      if(response.status===409||response.status===403){verified=false;if(await readRemote(token))conflict('Tài khoản hoặc bản sao đã thay đổi trên thiết bị khác. Kiểm tra hai bản trước khi tiếp tục.');return;}
      if(response.status===422){conflict('Bản trên máy chưa có từ đã học, nên Lexi giữ bản tài khoản. Khôi phục bản tài khoản hoặc nhập tệp dự phòng.');return;}
      if(!response.ok||!Number.isSafeInteger(json.revision)||json.revision<=baseRevision||!Number.isFinite(Date.parse(json.updatedAt))||(json.userId&&json.userId!==knownUser.id))throw new Error('No valid acknowledgement');
      remote={state:captured,hash,revision:json.revision,updatedAt:json.updatedAt};acknowledge(hash,json.revision,json.updatedAt);
      const currentHash=await env.digest(hooks.read());
      if(!live(token))return;
      if(generation===changes&&currentHash===hash)update('saved');
      else{update('pending','Bản trước đã được sao lưu; thay đổi mới đang chờ gửi.');later(100);}
    }
    function work(task){
      if(busy)return busy;
      const token=epoch;
      busy=(async()=>{try{await task(token);}catch{if(live(token))failed();}})().finally(()=>{busy=null;hooks.onStatus?.(snapshot());});
      return busy;
    }
    function sync(forceRead=false){
      clearTimeout(timer);
      if(!meta.enabled)return Promise.resolve();
      if(!env.online()){update('offline','Đang offline. Thay đổi mới đang chờ sao lưu khi có mạng.');return Promise.resolve();}
      if(blocked&&!forceRead)return Promise.resolve();
      return work(async token=>{
        if(forceRead||!verified){if(!await readRemote(token))return;if(!await reconcile(token))return;}
        await upload(token);
      });
    }
    function connect(){if(busy)return busy;epoch++;meta.enabled=true;remember();blocked=false;verified=false;return sync(true);}
    function changed(){changes++;view.localSaved=hooks.localAvailable();if(meta.enabled){if(!blocked){update(env.online()?'pending':'offline','Thay đổi mới đang chờ sao lưu.');later();}else hooks.onStatus?.(snapshot());}else update('off');}
    function pause(){epoch++;clearTimeout(timer);meta.enabled=false;remember();verified=false;blocked=false;update('off','Đã tạm dừng sao lưu tự động trên thiết bị này. Bản sao trên tài khoản vẫn được giữ.');}
    function signedOut(notify=true){
      epoch++;clearTimeout(timer);meta.enabled=false;remember();verified=false;blocked=false;knownUser=null;remote=null;
      view={...view,user:null,history:[],status:'signedout',message:'Đã dừng sao lưu trên máy này. Tiến độ trên máy và bản sao của tài khoản cũ vẫn được giữ.'};
      if(notify)hooks.onStatus?.(snapshot());
    }
    function prepareSignOut(){
      if(meta.enabled&&view.status!=='saved'&&!hooks.confirm?.('Tiến độ mới chưa được máy chủ xác nhận. Đăng xuất sẽ dừng sao lưu; bản trên máy vẫn được giữ. Bạn muốn tiếp tục đăng xuất?'))return false;
      // Keep the native top-level anchor intact until its default navigation runs.
      signedOut(false);return true;
    }
    function chooseLocal(){
      if(busy||!meta.enabled||!verified||!knownUser)return Promise.resolve();
      if(!hooks.confirm?.('Sao lưu bản trên máy này ('+count(hooks.read())+' từ đã học) thành bản mới nhất của tài khoản '+knownUser.email+'?'))return Promise.resolve();
      blocked=false;return work(upload);
    }
    function restore(){
      if(!remote||!meta.enabled||busy)return Promise.resolve();
      if(!hooks.canRestore()){hooks.toast?.('Đóng bài học đang mở rồi thử khôi phục lại nhé.');return Promise.resolve();}
      if(!hooks.confirm?.('Khôi phục bản tài khoản ('+count(remote.state)+' từ đã học, '+stamp(remote.updatedAt)+') để thay thế tiến độ trên máy này? Xuất bản trên máy trước nếu bạn muốn giữ cả hai.'))return Promise.resolve();
      const expectedRevision=remote.revision,expectedUserId=knownUser?.id;
      return work(async token=>{if(!await readRemote(token))return;if(knownUser?.id!==expectedUserId||!remote||remote.revision!==expectedRevision){conflict('Tài khoản hoặc bản sao vừa thay đổi. Hãy kiểm tra và chọn lại.');return;}await applyRemote(token);});
    }
    function restoreHistorical(revision){
      if(busy||!meta.enabled||!knownUser||!verified||!Number.isSafeInteger(revision)||revision<1)return Promise.resolve();
      if(!hooks.canRestore()){hooks.toast?.('Đóng bài học đang mở rồi khôi phục bản sao nhé.');return Promise.resolve();}
      const expectedUserId=knownUser.id;
      return work(async token=>{
        const {response,json}=await request('GET',undefined,'/api/backup?revision='+revision);
        if(!live(token))return;
        if(response.status===401){authRequired();return;}
        if(!response.ok)throw new Error('Historical backup unavailable');
        if(json.user?.id!==expectedUserId){if(await readRemote(token))conflict('Tài khoản vừa thay đổi. Hãy kiểm tra lại trước khi khôi phục.');return;}
        const b=json.backup;
        if(!b||b.revision!==revision||!Number.isFinite(Date.parse(b.updatedAt)))throw new Error('Invalid historical backup');
        const state=hooks.validate(b.state);
        if(!hooks.confirm?.('Dùng bản sao ngày '+stamp(b.updatedAt)+' ('+count(state)+' từ đã học) thay cho tiến độ trên máy? Bản được chọn sẽ được sao lưu thành bản mới nhất.'))return;
        if(!live(token)||!hooks.canRestore())return;
        hooks.replace(state);changes++;blocked=false;update('pending','Đã khôi phục trên máy; đang tạo bản sao mới trên tài khoản.');
        await upload(token);
      });
    }
    async function checkPersistence(request=false){
      try{
        const storage=typeof navigator==='undefined'?null:navigator.storage;
        if(!storage?.persisted||!storage?.persist){view.persistent='unsupported';hooks.onStatus?.(snapshot());return;}
        const granted=await storage.persisted()||(request?await storage.persist():false);
        view.persistent=granted?'granted':request?'denied':'available';
      }catch{view.persistent='error';}
      hooks.onStatus?.(snapshot());
    }
    function resume(){if(meta.enabled&&!busy&&Date.now()-lastCheck>5000)sync(true);}
    function start(resumeConnect=false){checkPersistence();if(resumeConnect){meta.enabled=true;remember();}if(meta.enabled)sync(true);else update('off');}
    return {start,connect,sync,changed,pause,signedOut,prepareSignOut,restore,restoreHistorical,chooseLocal,resume,checkPersistence,snapshot,refresh:()=>hooks.onStatus?.(snapshot())};
  }
  function panel(s){
    const saved=s.status==='saved',conflict=s.status==='conflict',signIn=s.status==='signin';
    const title={off:'Giữ tiến độ ngoài thiết bị',signedout:'Đăng nhập tài khoản khác',checking:'Đang kiểm tra bản sao',saving:'Đang sao lưu',saved:'Đã có bản sao trên tài khoản',pending:'Có thay đổi chưa sao lưu',offline:'Chờ mạng để sao lưu',error:'Chưa xác nhận được sao lưu',signin:'Đăng nhập để sao lưu',conflict:'Chọn bản tiến độ muốn dùng'}[s.status]||'Bảo vệ tiến độ';
    const status=s.message||(saved?'Những thay đổi hiện tại đã được máy chủ xác nhận.':'Bộ nhớ iPhone có thể bị dọn khi thiếu dung lượng. Bản sao trên tài khoản giúp bạn lấy lại tiến độ.');
    const storage={checking:'Đang kiểm tra…',granted:'Đã được cấp lưu trữ bền vững.',available:'Có thể yêu cầu lưu trữ bền vững.',denied:'Trình duyệt chưa cấp lưu trữ bền vững.',unsupported:'Trình duyệt chưa hỗ trợ yêu cầu lưu trữ bền vững.',error:'Chưa kiểm tra được quyền lưu trữ.'}[s.persistent];
    return '<div class="backup-card '+(saved?'is-saved':conflict?'is-conflict':'')+'"><div class="backup-card-title"><span class="backup-symbol" aria-hidden="true">'+(saved?'✓':'☁')+'</span><div><h3>'+esc(title)+'</h3><p>'+esc(status)+'</p></div></div>'+
      (s.user?'<p class="backup-account">Tài khoản: <strong>'+esc(s.user.email)+'</strong></p>':'')+
      (s.lastBackupAt?'<p class="backup-time">Lần xác nhận gần nhất: '+esc(stamp(s.lastBackupAt))+'</p>':'')+
      (!s.localSaved?'<p class="backup-local-error">Máy chưa lưu được tiến độ cục bộ. Giữ app mở đến khi sao lưu thành công hoặc xuất tệp dự phòng.</p>':'')+
      (conflict?'<div class="backup-choices"><div><span>Trên máy này</span><strong>'+s.localCount+' từ đã học</strong></div><div><span>Trên tài khoản</span><strong>'+(s.remote?s.remote.count+' từ đã học':'Chưa có bản sao')+'</strong>'+(s.remote?'<small>'+esc(stamp(s.remote.updatedAt))+'</small>':'')+'</div></div><div class="progress-actions">'+(s.remote?'<button class="btn btn-primary" data-backup="restore">Dùng bản tài khoản</button>':'')+'<button class="btn btn-outline" data-backup="local" '+(s.localCount===0&&s.remote?.count>0?'disabled':'')+'>Sao lưu bản trên máy</button><button class="btn btn-ghost" data-action="export">Xuất bản trên máy trước</button></div>':'')+
      '<div class="progress-actions">'+(s.status==='signedout'?'<a class="btn btn-primary" href="/signin-with-chatgpt?return_to=%2F%3Fbackup%3Dconnect%23progress" target="_top">Đăng nhập bằng ChatGPT</a>':!s.enabled?'<button class="btn btn-primary" data-backup="connect">Bật sao lưu bằng tài khoản</button>':signIn?'<a class="btn btn-primary" href="/signin-with-chatgpt?return_to=%2F%3Fbackup%3Dconnect%23progress" target="_top">Đăng nhập bằng ChatGPT</a>':!conflict?'<button class="btn btn-outline" data-backup="sync" '+(s.busy?'disabled':'')+'>Sao lưu ngay</button>':'')+(s.enabled?'<button class="btn btn-ghost" data-backup="pause">Tạm dừng sao lưu</button>':'')+(s.user?'<a class="btn btn-ghost" data-backup-signout href="/signout-with-chatgpt?return_to=%2F%3Fbackup%3Daccount%23progress" target="_top">Đăng xuất</a>':'')+'</div>'+(s.status==='signedout'?'<p class="backup-disclosure">Chọn tài khoản muốn dùng khi đăng nhập lại. Nếu màn hình đăng nhập vẫn tự chọn tài khoản cũ, hãy đổi tài khoản trên ChatGPT trong cùng trình duyệt rồi quay lại Lexi.</p>':'')+
      '<p class="backup-disclosure">Khi bật, tiến độ, từ đã lưu và mục tiêu được gửi đến cơ sở dữ liệu của Lexi, gắn với tài khoản ChatGPT bạn đăng nhập. Dùng cùng tài khoản để khôi phục trên iPhone hoặc PC. Các bản khác nhau cần bạn chọn; Lexi không tự gộp.</p>'+
      (s.enabled&&s.user&&s.history?.length?'<details class="backup-history"><summary>Khôi phục một bản sao trước</summary><p>Chọn theo thời gian. Bản được khôi phục sẽ trở thành một bản sao mới.</p><label>Bản sao <select data-backup-history aria-label="Chọn bản sao tiến độ">'+s.history.map(h=>'<option value="'+h.revision+'">'+esc(stamp(h.updatedAt))+' · '+h.learned+' từ</option>').join('')+'</select></label><button class="btn btn-outline" data-backup="history" '+(s.busy?'disabled':'')+'>Khôi phục bản đã chọn</button></details>':'')+'</div>'+
      '<div class="backup-device"><h3>Bảo vệ bản lưu trên máy</h3><p>'+esc(storage)+'</p>'+(['available','denied','error'].includes(s.persistent)?'<button class="btn btn-outline" data-backup="persist">Yêu cầu lưu trữ bền vững</button>':'')+'<p>Lưu trữ bền vững giúp giảm nguy cơ bị dọn; vẫn cần bản sao ngoài thiết bị. Trên iPhone, thêm Lexi vào Màn hình chính và mở từ biểu tượng đó.</p></div>'+
      '<div class="backup-file"><h3>Thêm một tệp dự phòng</h3><p>Xuất JSON hoặc chọn “Lưu vào Tệp” trong bảng chia sẻ của iPhone, rồi chọn iCloud Drive. Tệp này nằm ngoài dữ liệu trình duyệt.</p><div class="progress-actions"><button class="btn btn-outline" data-action="share-backup">Lưu vào Tệp / chia sẻ</button><button class="btn btn-ghost" data-action="export">Tải tệp JSON</button><button class="btn btn-ghost" data-action="import">Nhập bản sao</button></div></div>';
  }
  function banner(s){
    const titles={signedout:'Đã đăng xuất · tiến độ trên máy vẫn được giữ.',off:'Đừng để bộ nhớ đầy làm mất tiến độ.',checking:'Đang kiểm tra bản sao tiến độ…',saving:'Đang sao lưu tiến độ…',saved:'Tiến độ hiện tại đã được sao lưu.',pending:'Có tiến độ mới đang chờ sao lưu.',offline:'Đang offline · tiến độ mới chờ sao lưu.',error:'Chưa sao lưu được thay đổi mới.',signin:'Đăng nhập để giữ tiến độ ngoài thiết bị.',conflict:'Có hai bản tiến độ cần bạn chọn.'};
    const title=!s.localSaved?'Chưa lưu được tiến độ trên máy.':titles[s.status];
    return '<div><strong>'+esc(title)+'</strong><span>'+(s.status==='saved'?'Máy chủ xác nhận lúc '+esc(stamp(s.lastBackupAt))+'.':s.status==='off'?'Bật sao lưu tài khoản hoặc lưu một tệp vào iCloud Drive.':'Mở phần bảo vệ tiến độ để xem trạng thái và khôi phục.')+'</span></div><button class="btn '+(s.status==='saved'?'btn-ghost':'btn-secondary')+'" data-action="backup-settings">'+(s.status==='saved'?'Xem bản sao':'Bảo vệ tiến độ')+'</button>';
  }
  window.LEXI_BACKUP={create,panel,banner,canonical};
})();
