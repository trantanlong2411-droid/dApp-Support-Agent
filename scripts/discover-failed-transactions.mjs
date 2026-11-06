import {mkdir,writeFile} from 'node:fs/promises';
import {createMcpSession} from '../src/mcp.mjs';
import {analyze} from '../src/diagnosis.mjs';

const out={
 schema:'pharos-support-readonly-discovery-v1',observedAtUtc:new Date().toISOString(),
 network:'mainnet',chainId:1672,source:'Official Pharos hosted Chain MCP',
 action:'READ_ONLY_DISCOVERY_NOT_A_SIMULATION',scanLimits:{blocks:8,maxReceipts:64},
 scannedBlocks:[],checkedReceipts:0,failedTransactions:[],
 disclaimer:'A status-0 receipt proves failure. Different causes are not assumed unless an error or a valid gas clue supports them.'
};
const sleep=t=>new Promise(r=>setTimeout(r,t));
const mc=await createMcpSession();
try{
 const info=await mc.tool('get_chain_info');
 if(info?.chainId!==1672||info.chainIdMatches===false)throw Error('Wrong MCP chain');
 const head=BigInt(info.latestBlock);
 const offsets=[8n,16n,32n,64n,100n,150n,250n,500n];
 for(const offset of offsets){
  if(out.checkedReceipts>=64||out.failedTransactions.length>=5)break;
  const h=head-offset;
  if(h<1n)break;
  let block;
  try{block=await mc.tool('get_block',{block:'0x'+h.toString(16),includeTransactions:true})}
  catch(e){out.scannedBlocks.push({block:h.toString(),error:String(e.message||e).slice(0,120)});continue}
  if(!block||block.mcpError||!Array.isArray(block.transactions))continue;
  const candidates=block.transactions.filter(x=>x&&typeof x==='object'&&typeof x.hash==='string'&&
   typeof (x.input||x.data)==='string'&&(x.input||x.data).length>2).slice(0,12);
  out.scannedBlocks.push({block:h.toString(),candidateTransactions:candidates.length});
  for(const tx of candidates){
   if(out.checkedReceipts>=64||out.failedTransactions.length>=5)break;
   let receipt;
   try{receipt=await mc.tool('get_transaction_receipt',{hash:tx.hash})}catch{continue}
   out.checkedReceipts++;
   if(!receipt||receipt.mcpError||receipt.status!=='0x0')continue;
   let replay=null;
   if(tx.to&&typeof (tx.input||tx.data)==='string'){
    const b=BigInt(tx.blockNumber||block.number||'0x0');
    const call={from:tx.from,to:tx.to,data:tx.input||tx.data};
    if(tx.value)call.value=tx.value;
    if(tx.gas)call.gas=tx.gas;
    try{replay=await mc.tool('eth_call',{transaction:call,block:'0x'+(b>0n?b-1n:0n).toString(16)})}
    catch(e){replay={mcpError:{message:String(e.message||e)}}}
   }
   const report=analyze({hash:tx.hash,tx,receipt,replay,network:'mainnet',
    source:'Official hosted Pharos Chain MCP'});
   out.failedTransactions.push({hash:tx.hash,block:report.blockNumber,
    gasUsed:report.gasUsed,gasLimit:report.gasLimit,
    diagnosis:report.diagnosis,explorer:report.explorer,
    qualifier:'VERIFIED_MINED_STATUS_ZERO; revert replay may not reproduce mined state'});
   console.log('PHAROS_VERIFIED_REAL_FAILURE',JSON.stringify(out.failedTransactions.at(-1)));
  }
  await sleep(220);
 }
 out.diagnosisTypes=[...new Set(out.failedTransactions.map(e=>e.diagnosis.type))];
 out.threeDistinctOnchainFailureTypesVerified=out.diagnosisTypes.length>=3;
}finally{await mc.close()}
await mkdir('proof',{recursive:true});
await writeFile('proof/read-only-failure-discovery.json',JSON.stringify(out,null,2)+'\n');
console.log('PHAROS_FAILED_TX_DISCOVERY_SUMMARY',JSON.stringify({
 blocks:out.scannedBlocks.length,checkedReceipts:out.checkedReceipts,
 minedFailures:out.failedTransactions.length,diagnosisTypes:out.diagnosisTypes,
 threeDistinct:out.threeDistinctOnchainFailureTypesVerified
}));
