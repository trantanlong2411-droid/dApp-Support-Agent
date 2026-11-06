import {Interface} from 'ethers';
import {mkdir,writeFile} from 'node:fs/promises';
import {createMcpSession} from '../src/mcp.mjs';
import {decodeFailure} from '../src/diagnosis.mjs';
// Circle's official native USDC Mainnet address on Pharos (April 28, 2026).
const USDC='0xC879C018dB60520F4355C26eD1a6D572cdAC1815';
const abi=new Interface(['function transfer(address to,uint256 value)','function transferFrom(address from,address to,uint256 value)']);
const alice='0x0000000000000000000000000000000000000002';
const bob='0x0000000000000000000000000000000000000003';
const spender='0x0000000000000000000000000000000000000004';
const scenarios=[
 {name:'ERC20 allowance missing',transaction:{from:spender,to:USDC,
  data:abi.encodeFunctionData('transferFrom',[alice,bob,1000000n]),gas:'0xf4240'}},
 {name:'ERC20 token balance missing',transaction:{from:alice,to:USDC,
  data:abi.encodeFunctionData('transfer',[bob,1000000n]),gas:'0xf4240'}},
 {name:'Low gas limit on token transfer',transaction:{from:alice,to:USDC,
  data:abi.encodeFunctionData('transfer',[bob,1n]),gas:'0x7530'}}
];
const report={schema:'pharos-support-actual-mcp-readonly-error-lab-v1',
 checkedAtUtc:new Date().toISOString(),network:'mainnet',chainId:1672,
 officialToken:'https://www.circle.com/blog/now-available-usdc-cctp-on-pharos',
 usdcContract:USDC,callType:'NO_STATE_CHANGE_ETH_CALL_ONLY',
 scenarios:[],limitations:'No mined transaction and no gas is spent. These are real RPC simulations on the official USDC contract, not failed transaction receipts.'};
const s=await createMcpSession();
try{
 const info=await s.tool('get_chain_info');
 if(info.chainId!==1672||info.chainIdMatches===false)throw Error('Mainnet verification failed');
 for(const sample of scenarios){
  let result;
  try{result=await s.tool('eth_call',{transaction:sample.transaction,block:'latest'})}
  catch(e){result={mcpError:{message:String(e.message||e)}}}
  const diagnosis=decodeFailure(result);
  const error=result?.mcpError||null;
  const classified={scenario:sample.name,simulation:'REAL_READ_ONLY_MAINNET_ETH_CALL_NOT_MINED',
   origin:sample.transaction.from,token:USDC,gasLimit:sample.transaction.gas,
   returnedError:Boolean(error),mcpError:error,classification:diagnosis?.type||'UNCLASSIFIED',
   confidence:diagnosis?.confidence||'unverified',
   explanation:diagnosis?.explanation||'No supported revert cause identified',
   fix:diagnosis?.suggestedFixes?.[0]||null};
  report.scenarios.push(classified);
  console.log('PHAROS_LIVE_READONLY_ERROR_LAB',JSON.stringify(classified));
 }
}finally{await s.close()}
await mkdir('proof',{recursive:true});
await writeFile('proof/live-usdc-readonly-failure-simulations.json',JSON.stringify(report,null,2)+'\n');
console.log('PHAROS_LIVE_ERROR_LAB_SUMMARY',JSON.stringify(report.scenarios.map(x=>({name:x.scenario,class:x.classification}))));
