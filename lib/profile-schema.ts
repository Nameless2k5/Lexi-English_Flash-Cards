export type Profile = { nickname: string; avatar: string; color: string; image: string | null };
const avatars=['sprout','cat','fox','panda','owl','astronaut','rocket','sun','wave','tulip','book','spark'];
const colors=['lavender','mint','peach','pink','sky','lemon'];
export function validateProfile(raw: unknown): Profile {
  const next: Profile={nickname:'',avatar:'sprout',color:'lavender',image:null};
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return next;
  const p=raw as Record<string,unknown>;
  const name=typeof p.nickname==='string'?p.nickname.normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\u200b\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g,'').replace(/\s+/g,' ').trim():'';
  next.nickname=Array.from(name).slice(0,24).join('');
  if(typeof p.avatar==='string'&&avatars.includes(p.avatar))next.avatar=p.avatar;
  if(typeof p.color==='string'&&colors.includes(p.color))next.color=p.color;
  if(typeof p.image==='string'&&p.image.length<=90000&&/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(p.image)){
    try{const b=atob(p.image.slice(23));if(b.length>=5&&b.charCodeAt(0)===255&&b.charCodeAt(1)===216&&b.charCodeAt(2)===255&&b.charCodeAt(b.length-2)===255&&b.charCodeAt(b.length-1)===217)next.image=p.image;}catch{/* Invalid image is omitted. */}
  }
  return next;
}
