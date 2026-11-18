/* Runs before styles to apply the device preference without a light-theme flash. */
(() => {
  'use strict';
  const key='lexi-theme-v1',valid=v=>['light','dark','system'].includes(v);
  const system=typeof matchMedia==='function'?matchMedia('(prefers-color-scheme: dark)'):null;
  let preference='system';
  try{const stored=localStorage.getItem(key);if(valid(stored))preference=stored;}catch{/* A blocked store still permits an in-session theme. */}
  const resolved=()=>preference==='system'?(system?.matches?'dark':'light'):preference;
  function apply(){
    const value=resolved();document.documentElement.dataset.theme=value;document.documentElement.dataset.themePreference=preference;
    document.documentElement.style.colorScheme=value;
    const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=value==='dark'?'#121818':'#f8faf6';
    document.dispatchEvent(new CustomEvent('lexi-theme-change',{detail:{preference,resolved:value}}));
  }
  function setPreference(value){
    if(!valid(value))return {saved:false,preference,resolved:resolved()};
    preference=value;let saved=true;
    try{localStorage.setItem(key,value);}catch{saved=false;}
    apply();return {saved,preference,resolved:resolved()};
  }
  const systemChanged=()=>{if(preference==='system')apply();};
  if(system?.addEventListener)system.addEventListener('change',systemChanged);else system?.addListener?.(systemChanged);
  window.addEventListener('storage',event=>{if(event.key!==key&&event.key!==null)return;preference=valid(event.newValue)?event.newValue:'system';apply();});
  window.LEXI_THEME={getPreference:()=>preference,getResolved:resolved,setPreference,toggle:()=>setPreference(resolved()==='dark'?'light':'dark')};
  apply();
})();
