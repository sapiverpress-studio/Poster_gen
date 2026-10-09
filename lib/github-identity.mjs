import {createPublicKey,verify} from 'node:crypto';
export const REPOSITORY='sapiverpress-studio/Poster_gen';
export const REPOSITORY_ID='1410142097';
export const WORKFLOW_REF=REPOSITORY+'/.github/workflows/poster-publication.yml@refs/heads/main';
export async function verifyGithubIdentity(token,{audience,request=fetch,clock=()=>Date.now()}={}) {
 if(typeof token!=='string'||token.length>16000)throw Error('Denied');
 const parts=token.split('.');if(parts.length!==3)throw Error('Denied');
 const header=JSON.parse(Buffer.from(parts[0],'base64url')),claims=JSON.parse(Buffer.from(parts[1],'base64url'));
 const now=Math.floor(clock()/1000);
 if(header.alg!=='RS256'||typeof header.kid!=='string'||claims.iss!=='https://token.actions.githubusercontent.com'||claims.aud!==audience||claims.repository!==REPOSITORY||String(claims.repository_id)!==REPOSITORY_ID||claims.workflow_ref!==WORKFLOW_REF||claims.ref!=='refs/heads/main'||!['schedule','workflow_dispatch'].includes(claims.event_name)||!Number.isInteger(claims.exp)||claims.exp<=now||claims.exp>now+600||!Number.isInteger(claims.nbf)||claims.nbf>now+30||!Number.isInteger(claims.iat)||claims.iat>now+30||claims.iat<now-600||!/^\d+$/.test(String(claims.run_id||'')))throw Error('Denied');
 const r=await request('https://token.actions.githubusercontent.com/.well-known/jwks',{redirect:'error',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Denied');
 const body=await r.text();if(body.length>100000)throw Error('Denied');const keys=JSON.parse(body).keys;
 const key=keys?.find(k=>k.kid===header.kid&&k.kty==='RSA'&&k.use==='sig'&&(!k.alg||k.alg==='RS256'));
 if(!key||!verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),createPublicKey({key,format:'jwk'}),Buffer.from(parts[2],'base64url')))throw Error('Denied');
 return claims;
}
