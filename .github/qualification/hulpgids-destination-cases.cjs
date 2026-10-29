'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const directory = process.env.PROVIDER_DESTINATION_EVIDENCE;
const bundle = path.join(directory, 'actual-adapters.cjs');
const actualFetch = global.fetch;
const originalBase = process.env.BUILT_IN_FORGE_API_URL;
const originalKey = process.env.BUILT_IN_FORGE_API_KEY;
const results = [];
let dispatches = [];
function fresh(base, key = 'owned-synthetic-key') {
  if (base === undefined) delete process.env.BUILT_IN_FORGE_API_URL;
  else process.env.BUILT_IN_FORGE_API_URL = base;
  if (key === undefined) delete process.env.BUILT_IN_FORGE_API_KEY;
  else process.env.BUILT_IN_FORGE_API_KEY = key;
  delete require.cache[require.resolve(bundle)];
  return require(bundle);
}
function mock() {
  dispatches = [];
  global.fetch = async (input, options) => {
    dispatches.push({url:String(input), options});
    return new Response(JSON.stringify({ok:true}), {headers:{'content-type':'application/json'}});
  };
}
async function check(name, fun) {
  try { mock(); await fun(); results.push({name,pass:true}); }
  catch(error) { results.push({name,pass:false,error:error.stack}); }
}
function destination(origin) {
  assert.equal(dispatches.length, 1);
  assert.equal(new URL(dispatches[0].url).origin, origin);
  assert.equal(dispatches[0].options.redirect, 'error');
  assert.ok(dispatches[0].options.signal instanceof AbortSignal);
}
function listen(server) { return new Promise(resolve => server.listen(0,'127.0.0.1',resolve)); }
function close(server) { return new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); }
async function main() {
  const inputs = ['https://attacker.invalid/x','//attacker.invalid/x','http://127.0.0.1/private','http://169.254.169.254/latest/meta-data/','file:///etc/passwd','https://forge.manus.im@attacker.invalid/x','data:text/plain,secret','%2f%2fattacker.invalid'];
  for (const input of inputs) {
    await check('LLM message remains payload: '+input, async () => {
      const app=fresh('https://custom-provider.invalid:8443/prefix/');
      const result=await app.invokeLLM({messages:[{role:'user',content:input}],apiUrl:input,baseUrl:input,url:input,fetchOptions:{redirect:'follow'}});
      assert.deepEqual(result,{ok:true}); destination('https://custom-provider.invalid:8443');
      assert.equal(new URL(dispatches[0].url).pathname,'/prefix/v1/chat/completions');
      assert.equal(JSON.parse(dispatches[0].options.body).messages[0].content,input);
      assert.equal(dispatches[0].options.headers.authorization,'Bearer owned-synthetic-key');
    });
  }
  const endpoints=['//attacker.invalid/x','\\\\attacker.invalid/x','https://attacker.invalid/x','@attacker.invalid/x','/../../../../private','?target=https://attacker.invalid','#https://attacker.invalid','/%2f%2fattacker.invalid','/maps/api/geocode/json'];
  for (const endpoint of endpoints) {
    await check('Maps endpoint cannot replace configured authority: '+endpoint, async () => {
      const app=fresh('https://proxy.invalid:9443/base///');
      assert.deepEqual(await app.makeRequest(endpoint,{target:'http://127.0.0.1',url:'https://attacker.invalid',empty:null}),{ok:true});
      destination('https://proxy.invalid:9443');
      const url=new URL(dispatches[0].url);
      assert.equal(url.searchParams.get('key'),'owned-synthetic-key');
      assert.equal(url.searchParams.get('target'),'http://127.0.0.1');
      assert.equal(url.searchParams.has('empty'),false);
    });
  }
  await check('LLM missing configured base retains Manus fallback', async()=>{
    await fresh(undefined).invokeLLM({messages:[{role:'user',content:'ordinary control'}]}); destination('https://forge.manus.im');
    assert.equal(dispatches[0].url,'https://forge.manus.im/v1/chat/completions');
  });
  await check('LLM single trailing slash handling remains unchanged', async()=>{
    await fresh('https://custom-provider.invalid/base///').invokeLLM({messages:[]});
    assert.equal(new URL(dispatches[0].url).pathname,'/base///v1/chat/completions');
  });
  await check('Maps all trailing slashes handling remains unchanged', async()=>{
    await fresh('https://proxy.invalid/base///').makeRequest('/maps/api/geocode/json');
    assert.equal(new URL(dispatches[0].url).pathname,'/base/v1/maps/proxy/maps/api/geocode/json');
  });
  await check('environment changes after initialization cannot retarget the snapshot', async()=>{
    const app=fresh('https://first-provider.invalid');
    process.env.BUILT_IN_FORGE_API_URL='https://attacker.invalid';
    await app.invokeLLM({messages:[]}); destination('https://first-provider.invalid');
  });
  await check('missing Maps configuration fails before dispatch', async()=>{
    await assert.rejects(fresh(undefined).makeRequest('/maps/api/geocode/json'),/Google Maps proxy credentials missing/);assert.equal(dispatches.length,0);
  });
  await check('missing LLM key fails before dispatch', async()=>{
    await assert.rejects(fresh('https://proxy.invalid','').invokeLLM({messages:[]}),/OPENAI_API_KEY is not configured/);assert.equal(dispatches.length,0);
  });
  await check('trusted custom HTTP configuration remains explicitly possible', async()=>{
    await fresh('http://127.0.0.1:8123/custom').invokeLLM({messages:[]});destination('http://127.0.0.1:8123');
  });
  let secondaryRequests=0;
  const secondary=http.createServer((req,res)=>{secondaryRequests++;res.end('{}');});
  await listen(secondary);
  const secondaryBase='http://127.0.0.1:'+secondary.address().port;
  const primary=http.createServer((req,res)=>{
    if(req.url.includes('redirect')) {res.writeHead(302,{Location:secondaryBase+'/untrusted-target'});res.end();}
    else {res.setHeader('content-type','application/json');res.end('{"ok":true}');}
  });
  await listen(primary);
  const local='http://127.0.0.1:'+primary.address().port;
  try {
    for(const provider of ['Maps','LLM']) {
      await check(provider+' actual loopback success',async()=>{
        global.fetch=actualFetch;
        const app=fresh(local);
        const response=provider==='Maps'?await app.makeRequest('/success'):await app.invokeLLM({messages:[]});
        assert.deepEqual(response,{ok:true});
      });
      await check(provider+' actual redirect does not reach second listener',async()=>{
        global.fetch=actualFetch;
        const app=fresh(provider==='Maps'?local:local+'/redirect');
        const call=provider==='Maps'?app.makeRequest('/redirect'):app.invokeLLM({messages:[]});
        await assert.rejects(call,new RegExp(provider==='Maps'?'Google Maps request could not be completed':'LLM request could not be completed'));
        assert.equal(secondaryRequests,0);
      });
    }
  } finally {await close(primary);await close(secondary);}
}
main().catch(error=>results.push({name:'harness',pass:false,error:error.stack})).finally(()=>{
  global.fetch=actualFetch;
  if(originalBase===undefined)delete process.env.BUILT_IN_FORGE_API_URL;else process.env.BUILT_IN_FORGE_API_URL=originalBase;
  if(originalKey===undefined)delete process.env.BUILT_IN_FORGE_API_KEY;else process.env.BUILT_IN_FORGE_API_KEY=originalKey;
  fs.writeFileSync(path.join(directory,'cases.json'),JSON.stringify(results,null,2)+'\n');
  console.log(JSON.stringify({cases:results.length,passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,skipped:0}));
  process.exitCode=results.some(r=>!r.pass)?1:0;
});
