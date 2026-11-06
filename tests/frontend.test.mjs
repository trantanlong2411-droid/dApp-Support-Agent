import test from 'node:test';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
import {PAGE} from '../src/page.mjs';
test('public dashboard includes all reviewer functionality and valid client JavaScript',()=>{
 assert.match(PAGE,/<title>dApp Support Agent/);
 assert.match(PAGE,/Pharos Chain MCP/);
 assert.match(PAGE,/Mainnet example/);
 assert.match(PAGE,/Atlantic example/);
 assert.match(PAGE,/SIMULATED/);
 assert.match(PAGE,/id="report"/);
 assert.match(PAGE,/id="demos"/);
 const js=PAGE.match(/<script>([\s\S]*?)<\/script>/);
 assert.ok(js,'Missing browser controller');
 assert.doesNotThrow(()=>new Script(js[1]),'Browser script has syntax error');
 assert.doesNotMatch(PAGE,/<script src=/i);
});
