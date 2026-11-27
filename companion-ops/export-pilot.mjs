// One-book, owner-authorised read-only export. Never emit plaintext to a public
// Actions artifact. The calling SapiverForge runner holds the one-use private key.
import {createHash,createPublicKey,publicEncrypt,randomBytes,createCipheriv,constants} from 'node:crypto';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRemoteStore} from '../site/lib/github-remote-store.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const origin='https://sapiver-poster-gen-auth.netlify.app',audience=origin+'/poster/github-worker';
const expected='29335ae3de994c5919a997785d812300f20112bbe285bc38993ee7b06352e491';
const listing=4626688605;
async function rpc(body){
 const tokenUrl=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
 if(tokenUrl.protocol!=='https:'||!(tokenUrl.hostname==='run-actions.githubusercontent.com'||tokenUrl.hostname.endsWith('.actions.githubusercontent.com')))throw Error('Invalid issuer');
 tokenUrl.searchParams.set('audience',audience);
 const id=await fetch(tokenUrl,{headers:{Authorization:'Bearer '+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN},redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!id.ok)throw Error('OIDC unavailable');
 const token=(await id.json()).value;
 const r=await fetch(audience,{method:'POST',redirect:'error',signal:AbortSignal.timeout(60000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
 if(!r.ok)throw Error('Private archive bridge unavailable');
 return r.json();
}
let tmp;
try{
 if(process.env.GITHUB_REPOSITORY!=='sapiverpress-studio/Poster_gen'||process.env.GITHUB_REF!=='refs/heads/main'||process.env.GITHUB_EVENT_NAME!=='workflow_dispatch'||process.env.GITHUB_ACTOR!=='sapiverpress-studio')throw Error('Owner-only pilot');
 const nonce=process.env.COMPANION_NONCE||'';
 if(!/^[a-f0-9]{32}$/.test(nonce))throw Error('Invalid handoff nonce');
 const pem=Buffer.from(process.env.COMPANION_PUBLIC_KEY||'','base64').toString('utf8');
 const key=createPublicKey(pem);
 if(key.asymmetricKeyType!=='rsa'||key.asymmetricKeyDetails.modulusLength!==3072)throw Error('Invalid recipient key');
 const store=createRemoteStore('sapiver-poster-uploads',rpc);
 const found=[];
 for await(const page of store.list({prefix:'products/',paginate:true})){
  for(const b of page.blobs){const r=await store.get(b.key,{type:'json',consistency:'strong'});if(Number(r?.etsyListingId)===listing)found.push(r);}
 }
 if(found.length!==1)throw Error('Exact existing listing record unavailable');
 const rec=found[0];let raw;
 for(const revision of new Set([rec.currentRevision,rec.pendingRevision].filter(x=>/^[A-Za-z0-9_-]{32}$/.test(x||'')))){
  const a=await store.get('uploads/'+revision+'/state',{type:'json',consistency:'strong'});
  if(a?.metadata?.kind!=='activity-book'||a.archiveKey!=='uploads/'+revision+'/original.zip')continue;
  if(a.sourceHash&&a.sourceHash!==expected)continue;
  const data=await store.get(a.archiveKey,{type:'arrayBuffer',consistency:'strong'});
  if(data&&hash(Buffer.from(data))===expected){raw=Buffer.from(data);break;}
 }
 if(!raw)throw Error('Saved archive differs from owner-reviewed Christmas edition');
 tmp=mkdtempSync(join(tmpdir(),'hb-private-'));
 const input=join(tmp,'original.zip'),out=join(tmp,'companion.zip');writeFileSync(input,raw,{mode:0o600});
 execFileSync('python3',[new URL('./companion-pilot-package.py',import.meta.url).pathname,input,out],{stdio:'inherit',timeout:60000});
 const data=readFileSync(out),aes=randomBytes(32),iv=randomBytes(12);
 const cipher=createCipheriv('aes-256-gcm',aes,iv);cipher.setAAD(Buffer.from('hen-bea-pilot-v1:'+nonce));
 const encrypted=Buffer.concat([cipher.update(data),cipher.final()]);
 const wrapped=publicEncrypt({key,oaepHash:'sha256',padding:constants.RSA_PKCS1_OAEP_PADDING},aes);
 const size=Buffer.alloc(4);size.writeUInt32BE(wrapped.length);
 writeFileSync('companion.enc',Buffer.concat([size,wrapped,iv,cipher.getAuthTag(),encrypted]),{mode:0o600});
 console.log('Verified exact saved Christmas edition; encrypted companion handoff only.');
}catch(e){console.error('Companion pilot stopped: '+String(e.message).slice(0,180));process.exitCode=1;}
finally{if(tmp)rmSync(tmp,{recursive:true,force:true});}
