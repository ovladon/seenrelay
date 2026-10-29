import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { adminPage, adminSessionStatus } from '../src/admin.js';

const DEMO_SECRET='seenrelay-test-only-session-credential-0123456789';
function cookie(payload: {v: number; iat:number; exp:number; nonce:string},secret=DEMO_SECRET) {
  const encoded=Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature=createHmac('sha256',secret).update(encoded).digest('base64url');
  return 'sr_admin='+encoded+'.'+signature;
}
function validPayload(){
  const now=Math.floor(Date.now()/1000);
  return {v:1,iat:now,exp:now+300,nonce:'test-nonce'};
}
test('admin session probe checks the same authenticated cookie used by the page',async()=>{
  const original=process.env.ADMIN_SECRET;
  const previous=process.env.ADMIN_SECRET_PREVIOUS;
  process.env.ADMIN_SECRET=DEMO_SECRET;
  delete process.env.ADMIN_SECRET_PREVIOUS;
  try{
    const goodCookie=cookie(validPayload());
    const authed=new Request('https://seenrelay.com/admin/api/session',{headers:{cookie:goodCookie}});
    const verified=await adminSessionStatus(authed);
    assert.equal(verified.status,200);
    assert.deepEqual(await verified.json(),{authenticated:true});
    assert.equal(verified.headers.get('cache-control'),'no-store');
    assert.equal(verified.headers.get('content-security-policy')?.includes('script-src'),true);
    const html=await adminPage(new Request('https://seenrelay.com/admin',{headers:{cookie:goodCookie}}));
    const markup=await html.text();
    assert.match(markup,/data-auth="1"/);
    assert.match(markup,/admin-v2.js/);

    for(const bad of [
      undefined,
      cookie(validPayload(),'not-the-current-key-012345678901234'),
      cookie({...validPayload(),exp:Math.floor(Date.now()/1000)-2})
    ]){
      const request=new Request('https://seenrelay.com/admin/api/session',{headers:bad?{cookie:bad}:{}});
      const response=await adminSessionStatus(request);
      assert.equal(response.status,401);
      assert.equal((await response.json()).error.code,'ADMIN_UNAUTHORIZED');
      assert.equal((await adminPage(request)).status,200);
      assert.match(await (await adminPage(request)).text(),/data-auth="0"/);
    }
  } finally {
    if(original===undefined)delete process.env.ADMIN_SECRET;
    else process.env.ADMIN_SECRET=original;
    if(previous===undefined)delete process.env.ADMIN_SECRET_PREVIOUS;
    else process.env.ADMIN_SECRET_PREVIOUS=previous;
  }
});
