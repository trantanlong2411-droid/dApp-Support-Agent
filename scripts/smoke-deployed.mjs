import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base=(process.env.DAPP_WORKER_URL||'https://dapp-support-agent.trantanlong2411.workers.dev').replace(/\/$/,'');
const expectedVersion='pharos-dapp-support-2026-11-06-v1';
async function get(path){
 const r=await fetch(base+path,{cache:'no-store',signal:AbortSignal.timeout(15000),redirect:'manual'});
 const body=await r.text();
 let json;try{json=JSON.parse(body)}catch{json=null}
 return {status:r.status,data:json,body};
}
async function analyze(network,hash){
 const r=await fetch(base+'/api/analyze',{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({network,hash}),signal:AbortSignal.timeout(60000),redirect:'manual'
 });
 return {status:r.status,data:await r.json()};
}
let health;
for(let i=0;i<25;i++){
 try{
  health=await get('/api/health');
  if(health.status===200&&health.data?.version===expectedVersion)break;
  console.log('WAIT_FOR_DEPLOY',i+1,health.status,health.data?.version||health.body.slice(0,130));
 }catch(e){console.log('WAIT_FOR_DEPLOY',i+1,String(e.message||e).slice(0,150))}
 await new Promise(r=>setTimeout(r,4000));
}
assert.equal(health?.status,200,'Cloudflare Worker has not deployed to the expected hostname');
assert.equal(health.data.version,expectedVersion);
assert.equal(health.data.readOnly,true);
assert.ok(health.data.chains.some(c=>c.network==='mainnet'&&c.chainId===1672));
const demos=await get('/api/demos');
assert.equal(demos.status,200);assert.equal(demos.data.ok,true);
assert.ok(demos.data.cases.length>=3);
assert.ok(new Set(demos.data.cases.map(x=>x.diagnosis.type)).size>=3);
assert.ok(demos.data.cases.every(x=>x.simulated&&x.transactionHash===null&&x.explorer===null));
const bad=await analyze('mainnet','0xdeadbeef');
assert.equal(bad.status,400);
const atlanticHash='0x4a603ea2d43512a76cc21f2d64b09e1ec4e07c34adc929526b514289ccfa61e1';
const atlantic=await analyze('atlantic',atlanticHash);
assert.equal(atlantic.status,200,'Atlantic live Worker analysis failed: '+JSON.stringify(atlantic.data).slice(0,250));
assert.equal(atlantic.data.status,'SUCCESS');
assert.equal(atlantic.data.source.includes('NOT hosted'),false); // Adapter source label is explanatory prose
assert.equal(atlantic.data.network,'atlantic');
const mainnetHash='0x1d4a1ad3b359246a2a8be4fa8ed9a88b37c45c06b5e2a1411b016af0e24dbb5f';
const mainnet=await analyze('mainnet',mainnetHash);
assert.equal(mainnet.status,200,'Mainnet Chain MCP Worker failed: '+JSON.stringify(mainnet.data).slice(0,250));
assert.equal(mainnet.data.status,'SUCCESS');
assert.match(mainnet.data.source,/Chain MCP/);
assert.equal(mainnet.data.network,'mainnet');
const proof={schema:'pharos-dapp-support-deployed-v1',checkedAtUtc:new Date().toISOString(),
 origin:base,version:expectedVersion,
 tests:{liveMainnetMcpTransaction:true,liveAtlanticRpcTransaction:true,
  clearSyntheticFailures:true,hashInputValidation:true,readOnly:true},
 mainnet:{hash:mainnetHash,status:mainnet.data.status,source:mainnet.data.source},
 atlantic:{hash:atlanticHash,status:atlantic.data.status,source:atlantic.data.source},
 threeActualDistinctFailedTransactions:'NOT_YET_DEMONSTRATED',
 note:'Production test proves actual Chain MCP retrieval and 3 transparent synthetic failure categories, but not 3 on-chain failed transaction examples.'};
await mkdir('proof',{recursive:true});
await writeFile('proof/deployed-readiness.json',JSON.stringify(proof,null,2)+'\n');
console.log('DAPP_SUPPORT_DEPLOYED_MCP_VERIFIED',JSON.stringify(proof));
