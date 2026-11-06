import test from 'node:test';
import assert from 'node:assert/strict';
import {Interface} from 'ethers';
import {analyze,decodeFailure,simulatedCases} from '../src/diagnosis.mjs';
import {validateHash} from '../src/mcp.mjs';
const hash='0x'+'a'.repeat(64);
const tx={gas:'0x186a0',blockNumber:'0x100',value:'0x0',from:'0x0000000000000000000000000000000000000001',to:'0x0000000000000000000000000000000000000002',input:'0x12345678'};
const receipt={status:'0x0',blockNumber:'0x100',gasUsed:'0x7530'};
const errors=new Interface(['error Error(string)','error ERC20InsufficientAllowance(address,uint256,uint256)','error ERC20InsufficientBalance(address,uint256,uint256)']);
test('hash validation',()=>{assert.equal(validateHash(hash),true);assert.equal(validateHash('https://a.com'),false);assert.equal(validateHash('0x'+'z'.repeat(64)),false);});
test('receipt distinguishes success/pending/missing',()=>{
 assert.equal(analyze({hash,tx,receipt:{...receipt,status:'0x1'}}).status,'SUCCESS');
 assert.equal(analyze({hash,tx,receipt:null}).status,'PENDING');
 assert.equal(analyze({hash,tx:null,receipt:null}).status,'NOT_FOUND');
});
test('decode exact revert and explanation',()=>{
 const data=errors.encodeErrorResult('Error',['Slippage too high']);
 const d=analyze({hash,tx,receipt,replay:{mcpError:{code:-32000,message:'execution reverted',data}}});
 assert.equal(d.status,'FAILED');assert.equal(d.diagnosis.type,'REVERT_REASON');
 assert.equal(d.diagnosis.confidence,'high');assert.match(d.diagnosis.evidence.join(' '),/Slippage too high/);
 assert.equal(d.explorer,'https://pharosscan.xyz/tx/'+hash);
});
test('token approval versus token balance',()=>{
 const spender='0x0000000000000000000000000000000000000003';
 const allow=decodeFailure({mcpError:{message:'execution reverted',
 data:errors.encodeErrorResult('ERC20InsufficientAllowance',[spender,100n,1000n])}});
 assert.equal(allow.type,'INSUFFICIENT_ALLOWANCE');
 const bal=decodeFailure({mcpError:{message:'execution reverted',
 data:errors.encodeErrorResult('ERC20InsufficientBalance',[spender,100n,1000n])}});
 assert.equal(bal.type,'INSUFFICIENT_TOKEN_BALANCE');
});
test('gas exhausted remains plausible only',()=>{
 const d=analyze({hash,tx,receipt:{...receipt,gasUsed:tx.gas}});
 assert.equal(d.diagnosis.type,'OUT_OF_GAS_POSSIBLE');
 assert.equal(d.diagnosis.confidence,'medium');
});
test('unknown revert and prebroadcast insufficient gas balance',()=>{
 assert.equal(analyze({hash,tx,receipt}).diagnosis.type,'REVERT_UNKNOWN');
 assert.equal(decodeFailure({mcpError:{message:'insufficient funds for gas * price + value'}}).type,'INSUFFICIENT_NATIVE_FUNDS_PREBROADCAST');
});
test('3+ fixtures transparently marked simulations without fake hashes',()=>{
 const cases=simulatedCases();
 assert.ok(cases.length>=3);assert.ok(new Set(cases.map(x=>x.diagnosis.type)).size>=3);
 for(const c of cases){assert.equal(c.simulated,true);assert.equal(c.transactionHash,null);assert.equal(c.explorer,null);assert.equal(c.source,'SIMULATED_FIXTURE_NOT_ON_CHAIN');}
});
