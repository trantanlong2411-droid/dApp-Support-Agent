import {Interface,formatEther} from 'ethers';

const abi=new Interface([
 'error Error(string)','error Panic(uint256)',
 'error ERC20InsufficientAllowance(address spender,uint256 allowance,uint256 needed)',
 'error ERC20InsufficientBalance(address sender,uint256 balance,uint256 needed)'
]);
const quantity=x=>typeof x==='string'&&/^0x[0-9a-f]+$/i.test(x)?BigInt(x):null;
const sanitized=x=>String(x??'').replace(/[\x00-\x1f]/g,' ').slice(0,240);
const isError=x=>x?.mcpError||x?.rpcError;
const suggestions={
 REVERT_REASON:['Read the failed condition described by the contract.','Review the token, amount, deadline and slippage limit, then simulate before signing again.'],
 INSUFFICIENT_ALLOWANCE:['Check the token allowance granted to the dApp or spender.','Approve only the required amount for the verified spender, then retry after the approval is confirmed.'],
 INSUFFICIENT_TOKEN_BALANCE:['Check that your wallet has enough of the token, not just native gas currency.','Reduce the amount or fund the wallet, then simulate again.'],
 PANIC:['The contract ran into an unexpected internal error; confirm the call parameters.','If it persists, contact the dApp team and send them the transaction hash; do not repeatedly pay gas.'],
 OUT_OF_GAS_POSSIBLE:['The gas limit appears fully consumed. Recheck gas estimates and wallet balance before retrying.','A contract revert can look similar: simulate first and avoid blindly raising gas limits.'],
 REVERT_UNKNOWN:['The chain confirms the transaction failed, but did not provide a reliable detailed cause.','Retry a read-only simulation, check the contract documentation, and share the hash with the dApp support team.'],
 INSUFFICIENT_NATIVE_FUNDS_PREBROADCAST:['You need enough native coin to pay network fees as well as the transfer amount.','Top up the gas coin, lower the amount, or adjust fees before resubmitting.'],
 TX_NOT_FOUND:['Check that the hash is complete and that you selected the correct Pharos network.','The transaction could still be pending or your RPC has not indexed it yet.'],
 TX_PENDING:['The transaction has been found, but has no mined receipt yet.','Wait for confirmations. Do not send a replacement blindly.'],
 SUCCESS:['The transaction completed on-chain. If the dApp still reports an issue, check the app-specific result.','Contact the dApp team with the successful explorer link if its UI did not update.']
};
const config={
 REVERT_REASON:['Contract reverted','The smart contract rejected the operation.'],
 INSUFFICIENT_ALLOWANCE:['Token approval missing','The dApp was not allowed to spend enough of your tokens.'],
 INSUFFICIENT_TOKEN_BALANCE:['Not enough token balance','The wallet does not hold enough of the token to complete this transfer.'],
 PANIC:['Smart-contract execution error','The smart contract encountered an internal error.'],
 OUT_OF_GAS_POSSIBLE:['Likely gas limit issue','The transaction used all the gas you allowed, so it may have run out of gas.'],
 REVERT_UNKNOWN:['Transaction reverted (cause unconfirmed)','The blockchain confirms the attempt failed, but cannot reliably say why.'],
 INSUFFICIENT_NATIVE_FUNDS_PREBROADCAST:['Not enough gas currency','The transaction was rejected before it reached the chain because the wallet could not cover fees.'],
 TX_NOT_FOUND:['Transaction not found','No confirmed information is available for this hash on this selected network.'],
 TX_PENDING:['Transaction pending','The transaction is still waiting for a receipt.'],
 SUCCESS:['On-chain success','The blockchain says this transaction completed successfully.']
};
const make=(type,confidence,evidence=[],details={})=>({
 type,title:config[type][0],explanation:config[type][1],
 confidence,evidence,suggestedFixes:suggestions[type],...details
});

function extractRevertData(value){
 const queue=[value],seen=new Set();let depth=0;
 while(queue.length&&depth++<30){
  const x=queue.shift();
  if(!x||typeof x!=='object'||seen.has(x))continue;
  seen.add(x);
  for(const key of ['data','return','result','originalError','error','info','mcpError','rpcError']){
   const v=x[key];
   if(typeof v==='string'&&/^0x[0-9a-f]{8,}$/i.test(v)&&v.length%2===0)return v;
   if(v&&typeof v==='object')queue.push(v);
  }
 }
 return null;
}
export function decodeFailure(replay){
 const error=isError(replay)||replay?.error||null;
 const message=sanitized(typeof error==='string'?error:error?.message||'');
 const raw=extractRevertData(error||replay);
 if(raw){
  try{
   const decoded=abi.parseError(raw);
   if(decoded){
    if(decoded.name==='ERC20InsufficientAllowance')return make('INSUFFICIENT_ALLOWANCE','high',[
      'Contract returned ERC20InsufficientAllowance custom error',
      'Reported allowance is '+decoded.args[1].toString()+', required is '+decoded.args[2].toString()+' (token base units)'
    ],{revertName:decoded.name});
    if(decoded.name==='ERC20InsufficientBalance')return make('INSUFFICIENT_TOKEN_BALANCE','high',[
      'Contract returned ERC20InsufficientBalance custom error',
      'Reported token balance '+decoded.args[1]+' < required '+decoded.args[2]+' (base units)'
    ],{revertName:decoded.name});
    if(decoded.name==='Panic')return make('PANIC','high',[
      'Contract returned Panic('+decoded.args[0].toString()+')'
    ],{revertName:decoded.name});
    if(decoded.name==='Error'){
     const reason=sanitized(decoded.args[0]);
     const lower=reason.toLowerCase();
     if(/allowance|not approved|approval missing/.test(lower))
      return make('INSUFFICIENT_ALLOWANCE','high',['Contract revert text: '+reason],{revertReason:reason});
     if(/insufficient (token|erc20|balance)|transfer amount exceeds balance/.test(lower))
      return make('INSUFFICIENT_TOKEN_BALANCE','high',['Contract revert text: '+reason],{revertReason:reason});
     return make('REVERT_REASON','high',['Contract revert text: '+reason],{revertReason:reason});
    }
   }
  }catch{}
 }
 const lower=message.toLowerCase();
 // Explicit out-of-gas wording returned by a read-only eth_call is an
 // observation about THIS simulation, not proof of a mined transaction's cause.
 if(/(?:out of gas|run out of gas|gas required exceeds allowance|intrinsic gas too low)/i.test(lower))
  return make('OUT_OF_GAS_POSSIBLE','medium',[
   'Read-only call reports: '+message,
   'Gas was exhausted during this simulation; this is not an execution trace of an already-mined transaction.'
  ],{confidenceNote:'Gas exhaustion was observed in the read-only test only. Do not assign a mined failure cause without matching historical trace evidence.'});
 // Server error messages can be less trustworthy than typed revert data. Mark as medium.
 if(/insufficient allowance|erc20insufficientallowance|transfer amount exceeds allowance/.test(lower))
  return make('INSUFFICIENT_ALLOWANCE','medium',['Simulation returned: '+message]);
 if(/erc20insufficientbalance|transfer amount exceeds balance|insufficient token balance/.test(lower))
  return make('INSUFFICIENT_TOKEN_BALANCE','medium',['Simulation returned: '+message]);
 if(/insufficient funds for (gas|gas \* price)|insufficient funds for transfer/.test(lower))
  return make('INSUFFICIENT_NATIVE_FUNDS_PREBROADCAST','high',['Pre-broadcast error: '+message]);
 if(/execution reverted|reverted/.test(lower))
  return make('REVERT_REASON','medium',['Simulation reported contract revert: '+message]);
 return null;
}
export function analyze({hash=null,tx=null,receipt=null,replay=null,network='mainnet',source='official Pharos Chain MCP'}){
 const link=hash? (network==='mainnet'?'https://pharosscan.xyz/tx/':'https://atlantic.pharosscan.xyz/tx/')+hash:null;
 const meta={network,source,transactionHash:hash,explorer:link,
  blockNumber:receipt?.blockNumber&&quantity(receipt.blockNumber)!==null?quantity(receipt.blockNumber).toString():null,
  gasUsed:receipt?.gasUsed&&quantity(receipt.gasUsed)!==null?quantity(receipt.gasUsed).toString():null,
  gasLimit:tx?.gas&&quantity(tx.gas)!==null?quantity(tx.gas).toString():null,
  from:tx?.from||null,to:tx?.to||null,
  ethValue:tx?.value&&quantity(tx.value)!==null?formatEther(quantity(tx.value)):null
 };
 if(!tx&&!receipt)return {...meta,status:'NOT_FOUND',diagnosis:make('TX_NOT_FOUND','low',['Neither transaction nor receipt was found'])};
 if(!receipt)return {...meta,status:'PENDING',diagnosis:make('TX_PENDING','medium',['Transaction exists; receipt not yet available'])};
 const status=quantity(receipt.status);
 if(status===1n)return {...meta,status:'SUCCESS',diagnosis:make('SUCCESS','high',['Mined receipt status: 0x1'])};
 if(status!==0n)throw Error('Unrecognized receipt status; cannot claim failure');
 const sim=decodeFailure(replay);
 // A balance rejection before broadcast cannot itself have a mined status-0 receipt.
 // Historical state replay can hit a different balance and must not override on-chain facts.
 if(sim?.type==='INSUFFICIENT_NATIVE_FUNDS_PREBROADCAST')
  return {...meta,status:'FAILED',diagnosis:make('REVERT_UNKNOWN','low',[
   'Mined receipt status: 0x0',
   'Historical read-only replay reported a pre-broadcast native balance error, which cannot explain an already-mined receipt'
  ])};
 if(sim)return {...meta,status:'FAILED',diagnosis:{
   ...sim,evidence:['Mined receipt status: 0x0',...sim.evidence],
   confidenceNote:'Historical eth_call replay is a diagnostic hint, not a guaranteed reproduction of the exact mined state.'
 }};
 const gas=quantity(tx?.gas),used=quantity(receipt?.gasUsed);
 if(gas!==null&&used!==null&&gas>0n&&used>=gas)
  return {...meta,status:'FAILED',diagnosis:make('OUT_OF_GAS_POSSIBLE','medium',[
   'Mined receipt status: 0x0','Gas used '+used+' of limit '+gas,
   'Gas exhaustion is a clue, not conclusive without an execution trace'
  ])};
 return {...meta,status:'FAILED',diagnosis:make('REVERT_UNKNOWN','low',[
  'Mined receipt status: 0x0',
  'No reliable revert data available from historical read-only simulation'
 ])};
}
export function simulatedCases(){
 const base={hash:null,network:'mainnet',source:'SIMULATED_FIXTURE_NOT_ON_CHAIN',
  tx:{gas:'0x186a0',from:'0x0000000000000000000000000000000000000001',to:'0x0000000000000000000000000000000000000002',value:'0x0'},
  receipt:{status:'0x0',gasUsed:'0x7530',blockNumber:'0x1'}};
 const codeFor=new Interface(['error Error(string)','error ERC20InsufficientAllowance(address,uint256,uint256)']);
 return [
  {name:'Contract revert — slippage',...analyze({...base,replay:{mcpError:{message:'execution reverted',data:codeFor.encodeErrorResult('Error',['Slippage too high'])}}})},
  {name:'Token allowance too low',...analyze({...base,replay:{mcpError:{message:'execution reverted',data:codeFor.encodeErrorResult('ERC20InsufficientAllowance',['0x0000000000000000000000000000000000000003',100n,1000n])}}})},
  {name:'Gas limit fully consumed',...analyze({...base,receipt:{...base.receipt,gasUsed:base.tx.gas}})},
  {name:'Insufficient native balance (pre-broadcast)',status:'NOT_BROADCAST',network:'mainnet',source:'SIMULATED_FIXTURE_NOT_ON_CHAIN',transactionHash:null,explorer:null,
   diagnosis:decodeFailure({mcpError:{message:'insufficient funds for gas * price + value'}})}
 ].map((x)=>({...x,simulated:true}));
}
