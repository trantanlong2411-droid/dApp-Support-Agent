// Official Pharos MCP hosted server, Streamable HTTP protocol.
// The endpoint is fixed and never comes from a public input (no arbitrary fetch/SSRF).
export const MCP_HOST='https://mcp.pharos.xyz/mcp';
const VERSION='2025-03-26';
export const validateHash=hash=>typeof hash==='string'&&/^0x[0-9a-f]{64}$/i.test(hash);
const timeout=ms=>AbortSignal.timeout(ms);

function parseEnvelope(raw,contentType,id){
 if(raw.length>400000)throw Error('MCP response exceeded the safe limit');
 if(/text\/event-stream/i.test(contentType)){
  // Streamable HTTP SSE includes event: message / data: {jsonrpc...}; may contain keep-alives.
  let frames=[],data=[];
  for(const line of raw.split(/\r?\n/)){
   if(line.startsWith('data:'))data.push(line.slice(5).trimStart());
   else if(line===''){
    if(data.length){try{frames.push(JSON.parse(data.join('\n')))}catch{}data=[];}
   }
  }
  if(data.length){try{frames.push(JSON.parse(data.join('\n')))}catch{}}
  const match=frames.find(x=>x.id===id);
  if(!match)throw Error('MCP SSE did not return the expected JSON-RPC response');
  return match;
 }
 const json=JSON.parse(raw);
 return Array.isArray(json)?json.find(x=>x.id===id):json;
}
export async function createMcpSession(fetcher=fetch){
 let sid=null;
 let counter=0;
 async function send(method,params={},notification=false){
  const id=notification?undefined:++counter;
  const body={jsonrpc:'2.0',...(notification?{}:{id}),method,...(params?{params}:{})};
  const response=await fetcher(MCP_HOST,{
   method:'POST',headers:{
    'content-type':'application/json','accept':'application/json, text/event-stream',
    'mcp-protocol-version':VERSION,...(sid?{'mcp-session-id':sid}:{})
   },body:JSON.stringify(body),signal:timeout(17000),redirect:'manual'
  });
  if(response.status<200||response.status>=300)
   throw Error('Official Pharos MCP returned HTTP '+response.status);
  if(!sid){sid=response.headers.get('mcp-session-id');if(!sid&&!notification)throw Error('Pharos MCP did not establish a session');}
  if(notification)return null;
  const raw=await response.text();
  const envelope=parseEnvelope(raw,response.headers.get('content-type')||'',id);
  if(!envelope||envelope.error)throw Error('MCP transport: '+(envelope?.error?.message||'Invalid JSON-RPC reply'));
  return envelope.result;
 }
 await send('initialize',{protocolVersion:VERSION,capabilities:{},clientInfo:{name:'pharos-dapp-support-agent',version:'1.0.0'}});
 await send('notifications/initialized',{},true);
 return {
  async tool(name,args={}){
   if(!['get_chain_info','get_block','get_block_number','get_transaction','get_transaction_receipt','eth_call','get_balance'].includes(name))
    throw Error('Unsupported MCP tool');
   const response=await send('tools/call',{name,arguments:args});
   const entry=response?.content?.find(p=>p.type==='text'&&typeof p.text==='string');
   if(!entry)throw Error('Official Pharos MCP returned empty tool content');
   let value;try{value=JSON.parse(entry.text)}catch{throw Error('MCP tool response was not JSON')}
   if(response.isError)return {mcpError:value.error||value};
   return value;
  },
  async close(){
   if(!sid)return;
   // Best effort session cleanup. The remote server also expires sessions.
   try{await fetcher(MCP_HOST,{method:'DELETE',headers:{
    'mcp-session-id':sid,'mcp-protocol-version':VERSION,
    accept:'application/json, text/event-stream'},signal:timeout(2500),redirect:'manual'});}
   catch{}
  }
 };
}
