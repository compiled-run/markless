import { chromium } from '@playwright/test';
import { createRequire } from 'node:module';
import { readFile, writeFile, readdir, mkdtemp } from 'node:fs/promises';
import { createServer as createHttpServer, request as httpRequest } from 'node:http';
import { brotliCompressSync, createBrotliCompress, constants as zlibConstants } from 'node:zlib';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createSecureServer } from 'node:http2';
import { createServer } from 'node:net';
import { isolateMdxPayload, isolateUncheckedMdxPayload } from './payload-scope.ts';

const directory = process.env.DOCS_COLD_RESULTS ?? await mkdtemp('/private/tmp/markless-docs-cold-');
const root = new URL('../../../', import.meta.url).pathname.replace(/\/$/, '');
const output = process.env.DOCS_COLD_OUTPUT ?? `${root}/website/.output`;
const require = createRequire(`${root}/website/package.json`);
const siteEntry = `${output}/server/index.mjs`;
const sha256 = source => createHash('sha256').update(source).digest('hex');
const options = { brotli: process.env.DOCS_COLD_BROTLI === '1', brotliHtml: process.env.DOCS_COLD_HTML_BROTLI === '1', http2: process.env.DOCS_COLD_HTTP2 === '1', samples: Number(process.env.DOCS_COLD_SAMPLES ?? 3), conditions: (process.env.DOCS_COLD_CONDITIONS ?? 'normal,constrained').split(',') };
if (options.conditions.some(condition => !['normal', 'constrained', 'cpu-only'].includes(condition))) throw Error('Unknown timing condition');
const uncheckedScope = process.env.DOCS_COLD_SCOPE_PROBE === 'owned-records';
const scopeProbe = process.env.DOCS_COLD_SCOPE_PROBE === '1' || uncheckedScope;
const scopePrefix = process.env.DOCS_COLD_SCOPE_PREFIX ?? 'm3:';
const projectScope = html => uncheckedScope ? isolateUncheckedMdxPayload(html, scopePrefix) : isolateMdxPayload(html, scopePrefix);
const selectedCases = process.env.DOCS_COLD_CASES?.split(',');
const cases = [
  { name: 'state-counter', route: '/markless/concepts/state', kind: 'counter', text: /^Clicked \d+ times$/ },
  { name: 'computed-total', route: '/markless/concepts/computed', kind: 'computed', text: 'Add a shirt' },
  { name: 'mode-select', route: '/markless', kind: 'expanded', selector: '.mode-select-trigger' },
  { name: 'accordion', route: '/markless/ui/accordion', kind: 'expanded', selector: '.pg[data-family="accordion"] .pg-stage .trigger', index: 1 },
].filter(test => (!scopeProbe || uncheckedScope || test.name === 'state-counter') && (!selectedCases || selectedCases.includes(test.name)));
if (uncheckedScope && (!selectedCases || selectedCases.length !== 1)) throw Error('Unchecked scope diagnostic requires one explicitly selected case');
if (!cases.length) throw Error('No docs cases selected');
if (scopeProbe && !(options.brotli && options.brotliHtml)) throw Error('Scope probe requires identical Brotli handling for both variants');
const records = [];
let browser;
let server;
let proxy;
let serverLog = '';
console.log(JSON.stringify({resultsDirectory:directory,output}));
const metadata = { startedAt: new Date().toISOString(), siteEntry, serverEntrySha256: sha256(await readFile(siteEntry)), options, cache: 'CDP Network.setCacheDisabled true; fresh browser context per first interaction', serviceWorkers: 'blocked', timing: 'captured click event to expected DOM mutation; not compositor paint', localTransport: 'generated Nitro server over localhost HTTP/1.1', preciseCoverage: false };
metadata.cases = cases.map(test => test.name);
if (scopeProbe) metadata.scopeProbe = { uncheckedScope, prefix: scopePrefix, variants: ['full', 'isolated'], order: 'alternates within each sample', limitation: 'Diagnostic selected-scope payload projection; unchecked mode does not prove dependency independence. Other controls intentionally lose their records; this is not a shipping implementation or navigation test. Both HTML variants are buffered before compression; JS and markup are identical.' };
async function persist() { await writeFile(`${directory}/results.json`, JSON.stringify({ metadata, records, serverLog }, null, 2)); }
const port = await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => { const {port} = probe.address(); probe.close(() => resolve(port)); });
});
let origin = `http://127.0.0.1:${port}`;
try {
  server = spawn(process.execPath, [siteEntry], { cwd: `${root}/website`, env: { ...process.env, NITRO_HOST: '127.0.0.1', NITRO_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  console.log(JSON.stringify({serverPid:server.pid}));
  server.stdout.on('data', chunk => {serverLog += String(chunk);});
  server.stderr.on('data', chunk => {serverLog += String(chunk);});
  let ready = false;
  for(let i=0;i<100;i++) {
    if(server.exitCode !== null) throw Error(`Server exited: ${serverLog}`);
    try { const response=await fetch(origin+'/markless/theme.js'); if(response.ok) { metadata.servedThemeSha256=sha256(await response.text()); ready=true; break; }} catch {}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  if(!ready) throw Error('Preview did not start');
  metadata.expectedThemeSha256=sha256(await readFile(`${output}/public/theme.js`));
  if(metadata.servedThemeSha256!==metadata.expectedThemeSha256) throw Error('Served static asset identity mismatch');
  if(options.brotli) {
    const backend=origin;
    const compressed=new Map();
    for(const file of await readdir(output+'/public/build')) {
      if(!file.endsWith('.js')) continue;
      compressed.set('/markless/build/'+file,brotliCompressSync(await readFile(output+'/public/build/'+file),{params:{[zlibConstants.BROTLI_PARAM_QUALITY]:5}}));
    }
    let createProxy=createHttpServer;
    if(options.http2) {
      const certificates=await mkdtemp('/private/tmp/markless-docs-tls-');
      execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',certificates+'/key.pem','-out',certificates+'/cert.pem','-subj','/CN=localhost','-days','1'],{stdio:'ignore'});
      const tls={key:await readFile(certificates+'/key.pem'),cert:await readFile(certificates+'/cert.pem'),allowHTTP1:true};
      createProxy=handler=>createSecureServer(tls,handler);
    }
    proxy=createProxy((request,response)=>{
      const bytes=compressed.get(new URL(request.url,backend).pathname);
      if(bytes && request.headers['accept-encoding']?.includes('br')) {
        response.writeHead(200,{'content-type':'text/javascript','content-encoding':'br','content-length':String(bytes.length),'cache-control':'no-store','vary':'Accept-Encoding'});
        response.end(bytes);
        return;
      }
      const upstream=httpRequest(backend+request.url,{method:request.method,headers:Object.fromEntries(Object.entries(request.headers).filter(([key])=>!key.startsWith(':')))},incoming=>{
        const headers=Object.fromEntries(Object.entries(incoming.headers).filter(([key])=>!['connection','keep-alive','transfer-encoding','upgrade','proxy-connection'].includes(key.toLowerCase())));
        if (scopeProbe && headers['content-type']?.includes('text/html') && !headers['content-encoding']) {
          const chunks=[];
          incoming.on('data', chunk=>chunks.push(chunk));
          incoming.on('end', ()=>{
            try {
              const source=Buffer.concat(chunks).toString('utf8');
              const isolated=new URL(request.url,backend).searchParams.get('__scopeProbe')==='isolated';
              const html=isolated?projectScope(source):source;
              const compressedHtml=brotliCompressSync(html,{params:{[zlibConstants.BROTLI_PARAM_QUALITY]:5}});
              headers['content-encoding']='br'; headers['content-length']=String(compressedHtml.length);
              response.writeHead(incoming.statusCode,headers); response.end(compressedHtml);
            } catch(error) {response.writeHead(500);response.end(String(error));}
          });
          return;
        }
        if(options.brotliHtml && headers['content-type']?.includes('text/html') && !headers['content-encoding']) {
          headers['content-encoding']='br'; delete headers['content-length'];
          response.writeHead(incoming.statusCode,headers);
          const compress=createBrotliCompress({params:{[zlibConstants.BROTLI_PARAM_QUALITY]:5}});
          incoming.pipe(compress).pipe(response);
        } else {response.writeHead(incoming.statusCode,headers);incoming.pipe(response);}
      });
      upstream.on('error',error=>{response.writeHead(502);response.end(String(error));});
      request.pipe(upstream);
    });
    await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
    origin=(options.http2?'https':'http')+'://127.0.0.1:'+proxy.address().port;
    metadata.localTransport='Generated Nitro docs through a Brotli quality 5 JS proxy; localhost '+(options.http2?'HTTP/2 TLS':'HTTP/1.1')+'; HTML '+(scopeProbe?'buffered then compressed with Brotli quality 5':options.brotliHtml?'stream compressed with Brotli quality 5':'streaming forwarded unchanged');
  }
  browser = await chromium.launch({channel:'chrome',headless:true});
  metadata.browserVersion = browser.version();
  metadata.playwrightVersion = require('playwright-core/package.json').version;
  for(const condition of options.conditions) for(let sample=0;sample<options.samples;sample++) for(const test of cases) for(const variant of scopeProbe?(sample%2?['isolated','full']:['full','isolated']):['full']) {
    const context=await browser.newContext({serviceWorkers:'block',ignoreHTTPSErrors:options.http2,viewport:{width:1440,height:1000}});
    const page=await context.newPage();
    const cdp=await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
    if(condition==='constrained') {
      await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:625000,uploadThroughput:125000});
    }
    if(condition==='constrained'||condition==='cpu-only') {
      await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
    }
    const requests=new Map();
    let clockOffset;
    const errors=[];
    await page.addInitScript(()=>{
      window.__docsEventTimings=[];
      new PerformanceObserver(list=>window.__docsEventTimings.push(...list.getEntries().map(entry=>entry.toJSON()))).observe({type:'event',buffered:true,durationThreshold:16});
      new PerformanceObserver(list=>window.__docsEventTimings.push(...list.getEntries().map(entry=>entry.toJSON()))).observe({type:'first-input',buffered:true});
    });
    cdp.on('Network.requestWillBeSent', event=>{
      clockOffset ??= event.wallTime*1000-event.timestamp*1000;
      requests.set(event.requestId,{id:event.requestId,url:event.request.url,type:event.type,startEpochMs:event.wallTime*1000,initiator:event.initiator.type});
    });
    cdp.on('Network.responseReceived',event=>Object.assign(requests.get(event.requestId)??{}, {status:event.response.status,fromDiskCache:event.response.fromDiskCache??false,fromServiceWorker:event.response.fromServiceWorker??false,protocol:event.response.protocol,contentEncoding:event.response.headers["Content-Encoding"]??event.response.headers["content-encoding"]}));
    cdp.on('Network.requestServedFromCache',event=>Object.assign(requests.get(event.requestId)??{}, {servedFromCache:true}));
    cdp.on('Network.loadingFinished',event=>Object.assign(requests.get(event.requestId)??{}, {endEpochMs:clockOffset+event.timestamp*1000,encodedDataLength:event.encodedDataLength}));
    cdp.on('Network.loadingFailed',event=>Object.assign(requests.get(event.requestId)??{}, {endEpochMs:clockOffset+event.timestamp*1000,failure:event.errorText}));
    page.on('pageerror',error=>errors.push(String(error)));
    const record={test:test.name,condition,sample,variant,actions:[],errors};
    records.push(record);
    try {
      await page.goto(origin+test.route+(scopeProbe?'?__scopeProbe='+variant:''),{waitUntil:'commit',timeout:30000});
      const locator=test.selector?page.locator(test.selector).nth(test.index??0):page.getByRole('button',{name:test.text,exact:typeof test.text==='string'}).first();
      await locator.waitFor({state:'visible',timeout:30000});
      for(let repeat=0;repeat<3;repeat++) {
        await locator.evaluate((target,kind)=>{
          const read=()=>kind==='counter'?target.textContent:kind==='computed'?[...target.closest('section').querySelectorAll('p')].find(p=>p.textContent.trim().startsWith('Total:')).textContent:target.getAttribute('aria-expanded');
          const before=read();
          const oldNumber=Number(before.match(/\d+/)?.[0]);
          const expected=kind==='counter'?`Clicked ${oldNumber+1} times`:kind==='computed'?`Total: ${oldNumber+20}`:String(before!=='true');
          const action={before,expected,click:null,result:null,readyStateAtSetup:document.readyState};
          window.__docsColdAction=action;
          const observe=new MutationObserver(()=>{
            const after=read()?.trim();
            if(action.click && after===expected) {
              action.result={after,at:performance.now(),epochMs:performance.timeOrigin+performance.now()};
              requestAnimationFrame(()=>requestAnimationFrame(()=>{action.result.followingFrameAt=performance.now();}));
              observe.disconnect();
            }
          });
          observe.observe(document,{subtree:true,childList:true,characterData:true,attributes:true});
          window.addEventListener('click',event=>{
            action.click={at:performance.now(),eventTimeStamp:event.timeStamp,epochMs:performance.timeOrigin+performance.now(),trusted:event.isTrusted,readyState:document.readyState,inlineResumers:document.querySelectorAll('script[data-async-resumer]').length,containerScripts:[...target.closest('[data-async-container]').querySelectorAll('script')].map(s=>({type:s.type,attributes:s.getAttributeNames(),sourceBytes:s.textContent.length}))};
          },{capture:true,once:true});
          setTimeout(()=>observe.disconnect(),15000);
        },test.kind);
        await locator.click({timeout:15000,noWaitAfter:true});
        let observationFailed=false;
        try { await page.waitForFunction(()=>!!window.__docsColdAction?.result,null,{timeout:15000}); }
        catch { observationFailed=true; }
        const action=await page.evaluate(()=>window.__docsColdAction);
        action.repeat=repeat;
        action.observationFailed=observationFailed;
        action.latencyMs=action.result&&action.click?action.result.at-action.click.at:null;
        action.inputQueueMs=action.click?action.click.at-action.click.eventTimeStamp:null;
        action.scriptRequestsInFlightAtClick=[...requests.values()].filter(r=>r.type==='Script'&&r.startEpochMs<=action.click?.epochMs&&(!r.endEpochMs||r.endEpochMs>action.click.epochMs)).map(r=>r.url);
        action.scriptRequestsStartedAfterClick=[...requests.values()].filter(r=>r.type==='Script'&&r.startEpochMs>action.click?.epochMs&&r.startEpochMs<=(action.result?.epochMs??Infinity)).map(r=>r.url);
        record.actions.push(action);
        if(observationFailed) {
          await page.waitForLoadState('load',{timeout:30000});
          await locator.click({timeout:15000,noWaitAfter:true});
          await page.waitForTimeout(500);
          record.retryAfterLoad=await locator.evaluate((target,kind)=>kind==='computed'?target.closest('section').textContent:kind==='counter'?target.textContent:target.getAttribute('aria-expanded'),test.kind);
          throw Error('Expected DOM mutation did not occur');
        }
      }
      await page.waitForLoadState('load',{timeout:30000});
      record.serviceWorkerController=await page.evaluate(()=>!!navigator.serviceWorker.controller);
    } catch(error) { record.failure=String(error); }
    await page.waitForTimeout(200);
    record.eventTimings=await page.evaluate(()=>window.__docsEventTimings);
    record.navigationTiming=await page.evaluate(()=>performance.getEntriesByType('navigation').map(entry=>entry.toJSON()));
    record.requests=[...requests.values()];
    record.scriptRequests=record.requests.filter(r=>r.type==='Script').length;
    record.cachedResponses=record.requests.filter(r=>r.fromDiskCache||r.fromServiceWorker||r.servedFromCache).length;
    console.log(JSON.stringify({test:test.name,condition,sample,variant,latencyMs:record.actions.map(a=>a.latencyMs),scriptRequests:record.scriptRequests,inFlight:record.actions.map(a=>a.scriptRequestsInFlightAtClick.length),cachedResponses:record.cachedResponses,failure:record.failure}));
    await persist();
    await context.close();
  }
} finally {
  metadata.finishedAt=new Date().toISOString();
  await persist();
  if(browser) await browser.close();
  if(proxy) await new Promise(resolve=>proxy.close(resolve));
  if(server && server.exitCode===null) {server.kill('SIGTERM');await new Promise(resolve=>server.once('exit',resolve));}
}
