import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createMcpSession} from '../src/mcp.mjs';
import {atlanticRpc} from '../src/atlantic.mjs';
const result={schema:'pharos-dapp-support-live-transport-v1',
 checkedAtUtc:new Date().toISOString(),hostedMcp:'https://mcp.pharos.xyz/mcp',
 mainnet:{verified:false},atlantic:{verified:false}};
const mcp=await createMcpSession();
try{
 const info=await mcp.tool('get_chain_info');
 assert.equal(info.chainId,1672);
 assert.equal(info.chainIdMatches,true);
 result.mainnet={verified:true,chainId:1672,source:'Official hosted Pharos MCP',latestBlock:info.latestBlock};
 // A public deployment transaction cited in a documented Pharos mainnet Safe integration.
 const hash='0x1d4a1ad3b359246a2a8be4fa8ed9a88b37c45c06b5e2a1411b016af0e24dbb5f';
 const tx=await mcp.tool('get_transaction',{hash});
 const receipt=await mcp.tool('get_transaction_receipt',{hash});
 if(!tx?.mcpError&&tx?.hash?.toLowerCase()===hash&&receipt?.transactionHash?.toLowerCase()===hash){
  result.mainnet.sampleTransaction={hash,status:receipt.status,block:receipt.blockNumber,
   classification:'LIVE_TRANSACTION_HASH_RETRIEVAL_NOT_A_FAILED_TX'};
 }
}finally{await mcp.close()}
const chain=await atlanticRpc('eth_chainId');
assert.equal(BigInt(chain),688689n);
const hash='0x4a603ea2d43512a76cc21f2d64b09e1ec4e07c34adc929526b514289ccfa61e1';
const receipt=await atlanticRpc('eth_getTransactionReceipt',[hash]);
assert.equal(receipt?.status,'0x1');
result.atlantic={verified:true,chainId:688689,source:'Read-only JSON-RPC, NOT hosted MCP',
 sampleTransaction:{hash,block:receipt.blockNumber,status:receipt.status}};
await mkdir('proof',{recursive:true});
await writeFile('proof/live-chain-verification.json',JSON.stringify(result,null,2)+'\n');
console.log('PHAROS_SUPPORT_LIVE_MCP_AND_ATLANTIC_VERIFIED',JSON.stringify(result));
