// The official hosted MCP endpoint is mainnet-only (1672).
// Atlantic is a separate explicitly labeled read-only JSON-RPC adapter, NEVER described as MCP.
export const ATLANTIC_RPC='https://atlantic.dplabs-internal.com';
const ALLOWED=new Set(['eth_chainId','eth_getTransactionByHash','eth_getTransactionReceipt','eth_call','eth_getBalance']);
export async function atlanticRpc(method,params=[],fetcher=fetch){
 if(!ALLOWED.has(method))throw Error('Unsupported Atlantic read-only method');
 const response=await fetcher(ATLANTIC_RPC,{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({jsonrpc:'2.0',method,params,id:1}),
  signal:AbortSignal.timeout(15000),redirect:'manual'
 });
 if(!response.ok)throw Error('Atlantic RPC HTTP '+response.status);
 const payload=await response.json();
 if(payload.error)return {rpcError:payload.error};
 if(!Object.hasOwn(payload,'result'))throw Error('Malformed Atlantic JSON-RPC response');
 return payload.result;
}
