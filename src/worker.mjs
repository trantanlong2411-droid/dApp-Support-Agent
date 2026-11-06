import {createMcpSession,validateHash} from './mcp.mjs';
import {atlanticRpc} from './atlantic.mjs';
import {analyze,simulatedCases} from './diagnosis.mjs';
import {PAGE} from './page.mjs';

const VERSION='pharos-dapp-support-2026-11-06-v1';
const headers={'cache-control':'no-store','x-content-type-options':'nosniff'};
const json=(o,status=200)=>Response.json(o,{status,headers});
const trunc=e=>String(e?.message||e||'unknown').slice(0,190);
function prevBlock(tx){
 const b=typeof tx?.blockNumber==='string'&&/^0x[0-9a-f]+$/i.test(tx.blockNumber)
  ?BigInt(tx.blockNumber):null;
 return b&&b>0n?'0x'+(b-1n).toString(16):'latest';
}
function callArgs(tx){
 const v={};
 if(/^0x[a-f0-9]{40}$/i.test(tx?.from||''))v.from=tx.from;
 if(/^0x[a-f0-9]{40}$/i.test(tx?.to||''))v.to=tx.to;
 const data=tx?.input||tx?.data;
 if(/^0x(?:[0-9a-f]{2})*$/i.test(data||''))v.data=data;
 for(const key of ['value','gas'])if(/^0x[0-9a-f]+$/i.test(tx?.[key]||''))v[key]=tx[key];
 return v;
}
function shouldReplay(tx,receipt){
 return tx&&receipt&&receipt.status==='0x0'&&
  /^0x[a-f0-9]{40}$/i.test(tx.to||'')&&
  typeof (tx.input||tx.data)==='string';
}
async function inspectOnMainnet(hash,sessionFactory=createMcpSession){
 const s=await sessionFactory();
 try{
  const chain=await s.tool('get_chain_info');
  if(chain.mcpError||chain.chainId!==1672||chain.chainIdMatches===false)
   throw Error('Pharos MCP chain verification failed (expected mainnet 1672)');
  const [tx,receipt]=await Promise.all([
   s.tool('get_transaction',{hash}),
   s.tool('get_transaction_receipt',{hash})
  ]);
  if(tx?.mcpError||receipt?.mcpError)
   throw Error('MCP could not retrieve the transaction or its receipt');
  let replay=null;
  if(shouldReplay(tx,receipt)){
   replay=await s.tool('eth_call',{transaction:callArgs(tx),block:prevBlock(tx)});
  }
  return analyze({hash,tx,receipt,replay,network:'mainnet',
   source:'Pharos official hosted Chain MCP tools (get_transaction, get_transaction_receipt, eth_call)'});
 }finally{await s.close()}
}
async function inspectAtlantic(hash,transport=atlanticRpc){
 const chain=await transport('eth_chainId',[]);
 if(chain?.rpcError||BigInt(chain)!==688689n)
  throw Error('Atlantic JSON-RPC chain ID mismatch (expected 688689)');
 const [tx,receipt]=await Promise.all([
  transport('eth_getTransactionByHash',[hash]),
  transport('eth_getTransactionReceipt',[hash])
 ]);
 if(tx?.rpcError||receipt?.rpcError)throw Error('Atlantic RPC could not retrieve transaction information');
 let replay=null;
 if(shouldReplay(tx,receipt)){
  replay=await transport('eth_call',[callArgs(tx),prevBlock(tx)]);
 }
 return analyze({hash,tx,receipt,replay,network:'atlantic',
  source:'Pharos Atlantic read-only JSON-RPC (not hosted Chain MCP)'});
}

const rateMap=new Map();
function limited(request){
 const ip=(request.headers.get('cf-connecting-ip')||'unknown').slice(0,95);
 const now=Date.now();
 const prev=rateMap.get(ip);
 if(!prev||now-prev.start>60000){rateMap.set(ip,{start:now,count:1});return false}
 prev.count++;
 return prev.count>8;
}
export {inspectOnMainnet,inspectAtlantic};
export default{
 async fetch(request){
  const url=new URL(request.url);
  if(request.method==='GET'&&url.pathname==='/'){
   return new Response(PAGE,{headers:{'content-type':'text/html;charset=utf-8',
    'cache-control':'no-store','x-content-type-options':'nosniff',
    'content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'"
   }});
  }
  if(request.method==='GET'&&url.pathname==='/api/health'){
   return json({ok:true,version:VERSION,
    chains:[{network:'mainnet',chainId:1672,method:'Official hosted Chain MCP',mcp:'https://mcp.pharos.xyz/mcp'},
      {network:'atlantic',chainId:688689,method:'Read-only JSON-RPC (NOT hosted Chain MCP)'}],
    safe:true,readOnly:true,requiresWallet:false,
    supportCases:['contract revert reason','ERC20 allowance or token balance',
      'gas usage / possible out of gas','unknown failure / pending / not found']});
  }
  if(request.method==='GET'&&url.pathname==='/api/demos'){
   return json({ok:true,source:'SYNTHETIC_TEST_FIXTURES_NOT_REAL_TRANSACTIONS',
    note:'These demonstrate the explanation engine for four failure modes; they do not prove on-chain occurrences.',
    cases:simulatedCases()});
  }
  if(request.method==='POST'&&url.pathname==='/api/analyze'){
   if(limited(request))return json({ok:false,error:'Rate limit: try again after one minute'},429);
   let body;
   try{
    const raw=await request.text();
    if(raw.length>1200)throw Error('Payload too long');
    body=JSON.parse(raw);
   }catch{return json({ok:false,error:'Provide a small JSON request'},400)}
   if(!validateHash(body?.hash))
    return json({ok:false,error:'Enter a real 0x-prefixed 32-byte transaction hash'},400);
   if(!['mainnet','atlantic'].includes(body.network))
    return json({ok:false,error:'Choose mainnet or atlantic'},400);
   try{
    const result=body.network==='mainnet'
      ?await inspectOnMainnet(body.hash)
      :await inspectAtlantic(body.hash);
    return json({ok:true,observedAtUtc:new Date().toISOString(),...result});
   }catch(ex){
    // A timeout/upstream error is not an on-chain failure. Never invent a diagnosis.
    return json({ok:false,source:body.network==='mainnet'?'Official hosted Chain MCP':'Atlantic JSON-RPC',
      error:'Could not verify this transaction: '+trunc(ex),
      note:'Network connectivity errors do not prove the transaction failed. Check the explorer or retry later.'},503);
   }
  }
  return json({ok:false,error:'Not found'},404);
 }
};
