/* Local profile tools. Photos are cropped and compressed on the device. */
(() => {
  'use strict';
  const avatars=[['sprout','🌱','Mầm xanh'],['cat','🐱','Mèo nhỏ'],['fox','🦊','Cáo lanh lợi'],['panda','🐼','Gấu trúc'],['owl','🦉','Cú thông thái'],['astronaut','🧑‍🚀','Nhà du hành'],['rocket','🚀','Tên lửa'],['sun','☀️','Nắng ấm'],['wave','🌊','Sóng biển'],['tulip','🌷','Tulip'],['book','📚','Mọt sách'],['spark','⚡','Tia chớp']];
  const colors=[['lavender','#E8DFFF','Tím lavender'],['mint','#CEEBDD','Xanh bạc hà'],['peach','#FFDEC5','Cam đào'],['pink','#FAD9E9','Hồng'],['sky','#D7E9FF','Xanh trời'],['lemon','#F2EDBC','Vàng chanh']];
  const defaults=()=>({nickname:'',avatar:'sprout',color:'lavender',image:null});
  const cleanName=value=>typeof value==='string'?value.normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\u200b\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g,'').replace(/\s+/g,' ').trim():'';
  function validImage(value){
    if(typeof value!=='string'||value.length>90000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))return false;
    try{const b=atob(value.slice(23));return b.length>=5&&b.charCodeAt(0)===255&&b.charCodeAt(1)===216&&b.charCodeAt(2)===255&&b.charCodeAt(b.length-2)===255&&b.charCodeAt(b.length-1)===217;}catch{return false;}
  }
  function validate(raw){
    const next=defaults();if(!raw||typeof raw!=='object'||Array.isArray(raw))return next;
    next.nickname=Array.from(cleanName(raw.nickname)).slice(0,24).join('');
    if(avatars.some(([id])=>id===raw.avatar))next.avatar=raw.avatar;
    if(colors.some(([id])=>id===raw.color))next.color=raw.color;
    if(validImage(raw.image))next.image=raw.image;
    return next;
  }
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function avatar(raw,size=48){
    const p=validate(raw),preset=avatars.find(([id])=>id===p.avatar),color=colors.find(([id])=>id===p.color)[1];
    return '<span class="personal-avatar" style="--avatar-size:'+Number(size)+'px;--avatar-color:'+color+'">'+(p.image?'<img src="'+esc(p.image)+'" alt="" width="'+Number(size)+'" height="'+Number(size)+'">':'<span aria-hidden="true">'+preset[1]+'</span>')+'</span>';
  }
  async function photo(file,options={}){
    if(!file||file.size>8*1024*1024)throw new Error('Chọn ảnh tối đa 8 MB nhé.');
    if(!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type))throw new Error('Hãy chọn ảnh JPG, PNG, WebP hoặc ảnh HEIC được trình duyệt hỗ trợ.');
    const url=URL.createObjectURL(file);
    try{
      const image=new Image();
      await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('Chưa đọc được ảnh này. Hãy thử ảnh JPG hoặc PNG.'));image.src=url;});
      const w=image.naturalWidth,h=image.naturalHeight;if(!w||!h||w*h>40000000)throw new Error('Ảnh quá lớn. Hãy chọn ảnh có độ phân giải nhỏ hơn.');
      if(options.isCurrent&&!options.isCurrent())return null;
      if(!window.LEXI_AVATAR_CROP)throw new Error('Chưa tải được công cụ căn chỉnh. Hãy mở lại Lexi khi có mạng.');
      const result=await window.LEXI_AVATAR_CROP.open(image);
      if(result===null)return null;
      if(!validImage(result))throw new Error('Chưa thu nhỏ được ảnh. Hãy chọn ảnh khác.');
      return result;
    }finally{URL.revokeObjectURL(url);}
  }
  window.LEXI_PROFILE={avatars,colors,defaults,cleanName,validImage,validate,avatar,photo};
})();
