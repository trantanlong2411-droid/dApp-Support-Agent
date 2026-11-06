import test from 'node:test';
import assert from 'node:assert/strict';
import {createMcpSession} from '../src/mcp.mjs';
const headerMap=entries=>({get:key=>entries[key.toLowerCase()]||null});
test('official Streamable HTTP handshake + tool call + session cleanup',async()=>{
 let initialized=false,sent=0,deleted=false;
 const mock=async(url,opts)=>{
  assert.equal(url,'https://mcp.pharos.xyz/mcp');
  if(opts.method==='DELETE'){
   assert.equal(opts.headers['mcp-session-id'],'sess-test');deleted=true;
   return {status:200,ok:true,headers:headerMap({}),text:async()=>''};
  }
  const payload=JSON.parse(opts.body);sent++;
  assert.equal(opts.method,'POST');
  if(payload.method==='initialize'){
   assert.equal(payload.params.protocolVersion,'2025-03-26');
   return {status:200,ok:true,headers:headerMap({'mcp-session-id':'sess-test','content-type':'application/json'}),
    text:async()=>JSON.stringify({jsonrpc:'2.0',id:payload.id,result:{protocolVersion:'2025-03-26',capabilities:{}}})};
  }
  assert.equal(opts.headers['mcp-session-id'],'sess-test');
  if(payload.method==='notifications/initialized'){
   initialized=true;
   return {status:202,ok:true,headers:headerMap({}),text:async()=>''};
  }
  assert.equal(payload.method,'tools/call');
  assert.equal(payload.params.name,'get_transaction_receipt');
  const reply={jsonrpc:'2.0',id:payload.id,result:{
   content:[{type:'text',text:JSON.stringify({status:'0x0',gasUsed:'0x1234'})}]
  }};
  return {status:200,ok:true,headers:headerMap({'content-type':'text/event-stream'}),
   text:async()=>['event: message','data: '+JSON.stringify(reply),'',''].join('\n')};
 };
 const session=await createMcpSession(mock);
 assert.equal(initialized,true);
 const receipt=await session.tool('get_transaction_receipt',{hash:'0x'+'a'.repeat(64)});
 assert.equal(receipt.status,'0x0');
 await assert.rejects(session.tool('send_raw_transaction',{}),/Unsupported/);
 await session.close();
 assert.equal(deleted,true);assert.equal(sent,3);
});
