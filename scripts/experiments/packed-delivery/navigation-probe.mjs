import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, stat, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

const root = new URL('../../../', import.meta.url).pathname.replace(/\/$/, '');
const output = process.env.DOCS_COLD_OUTPUT ?? `${root}/website/.output`;
const directory = await mkdtemp('/private/tmp/markless-docs-navigation-');
const records = [];
const port = await new Promise(resolve => {
  const probe = createServer();
  probe.listen(0, '127.0.0.1', () => { const {port} = probe.address(); probe.close(() => resolve(port)); });
});
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [output+'/server/index.mjs'], {cwd:root+'/website',env:{...process.env,NITRO_HOST:'127.0.0.1',NITRO_PORT:String(port)},stdio:['ignore','pipe','pipe']});
let serverLog = '';
server.stdout.on('data', bytes => serverLog += bytes);
server.stderr.on('data', bytes => serverLog += bytes);
let browser;
console.log(JSON.stringify({directory,serverPid:server.pid}));
const persist = () => writeFile(directory+'/results.json', JSON.stringify({output,records,serverLog},null,2));
try {
  await expect.poll(async () => {try{return (await fetch(origin+'/markless/theme.js')).status;}catch{return 0;}},{timeout:15000}).toBe(200);
  browser = await chromium.launch({channel:'chrome',headless:true});
  async function visit(name, run) {
    const context = await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000}});
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
    const record = {name,requests:[],errors:[]}; records.push(record);
    page.on('request', request => record.requests.push({url:request.url(),type:request.resourceType()}));
    page.on('pageerror', error => record.errors.push(String(error)));
    try {await run({page,context,record});record.passed=true;} catch(error){record.failure=String(error);record.pageUrl=page.url();await page.screenshot({path:directory+'/'+records.length+'-failure.png'});process.exitCode=1;}
    await persist(); await context.close(); console.log(JSON.stringify({name,passed:record.passed,failure:record.failure}));
  }
  const frameworkRequests = record => record.requests.filter(request=>request.type==='script' && new URL(request.url).pathname.startsWith('/markless/build/'));
  await visit('closed menu ignores header input, then opens and dismisses normally', async ({page,record}) => {
    await page.goto(origin+'/markless/concepts/state');
    const header=await page.locator('.site-header').boundingBox();
    assert.ok(header);
    const point={x:header.x+header.width*0.6,y:header.y+header.height*0.5};
    assert.equal(await page.evaluate(({x,y})=>!!document.elementFromPoint(x,y).closest('a,button'),point),false);
    await page.keyboard.press('Escape');
    await page.mouse.click(point.x,point.y);
    const counter=page.getByRole('button',{name:/^Clicked \d+ times$/}).first();
    for(let count=1;count<=3;count++){await counter.click();await expect(counter).toHaveText(`Clicked ${count} times`);}
    record.afterCounter=await counter.evaluate(button=>{const root=button.closest('[data-async-container]');return {started:!!root.__asyncResumeRuntimeStarted,values:[...root.__marklessEventOnlyGraph]};});
    assert.equal(record.afterCounter.started,false);
    assert.equal(record.afterCounter.values.length,1);
    const menu=page.locator('.mode-select-trigger');
    await menu.click();await expect(menu).toHaveAttribute('aria-expanded','true');
    await page.mouse.click(point.x,point.y);await expect(menu).toHaveAttribute('aria-expanded','false');
    await menu.click();await expect(menu).toHaveAttribute('aria-expanded','true');
    await page.keyboard.press('Escape');await expect(menu).toHaveAttribute('aria-expanded','false');
    await counter.click();await expect(counter).toHaveText('Clicked 4 times');
    assert.equal(frameworkRequests(record).length,5);
    assert.deepEqual(record.errors,[]);
  });
  await visit('scalar clicks hand live state to a complex control and continue afterward', async ({page,record}) => {
    await page.goto(origin+'/markless/concepts/state');
    const counter=page.getByRole('button',{name:/^Clicked \d+ times$/}).first();
    const watched=page.getByRole('button',{name:'Add one to the watched variable',exact:true});
    await counter.click(); await expect(counter).toHaveText('Clicked 1 times');
    await counter.click(); await expect(counter).toHaveText('Clicked 2 times');
    await watched.click(); await expect(page.getByText('A watched variable: 1',{exact:true})).toBeVisible();
    record.beforeFull=await counter.evaluate(button=>{const root=button.closest('[data-async-container]');return {started:!!root.__asyncResumeRuntimeStarted,values:[...root.__marklessEventOnlyGraph]};});
    assert.equal(record.beforeFull.started,false);
    assert.equal(record.beforeFull.values.length,2);
    const menu=page.locator('.mode-select-trigger');
    await menu.click(); await expect(menu).toHaveAttribute('aria-expanded','true');
    await page.keyboard.press('Escape'); await expect(menu).toHaveAttribute('aria-expanded','false');
    assert.equal(await counter.evaluate(button=>!!button.closest('[data-async-container]').__asyncResumeRuntimeStarted),true);
    await counter.click(); await expect(counter).toHaveText('Clicked 3 times');
    await watched.click(); await expect(page.getByText('A watched variable: 2',{exact:true})).toBeVisible();
    assert.equal(frameworkRequests(record).length,5);
    assert.deepEqual(record.errors,[]);
  });
  await visit('keyboard priming and queued scalar clicks preserve each update', async ({page,record}) => {
    await page.goto(origin+'/markless/concepts/state');
    const counter=page.getByRole('button',{name:/^Clicked \d+ times$/}).first();
    await counter.focus(); await counter.press('Enter'); await expect(counter).toHaveText('Clicked 1 times');
    await counter.press('Space'); await expect(counter).toHaveText('Clicked 2 times');
    await counter.evaluate(button=>{for(let i=0;i<10;i++)button.click();});
    await expect(counter).toHaveText('Clicked 12 times');
    assert.equal(await counter.evaluate(button=>!!button.closest('[data-async-container]').__asyncResumeRuntimeStarted),false);
    assert.deepEqual(record.errors,[]);
  });
  await visit('intent, SPA navigation, history and offline controls', async ({page,context,record}) => {
    await page.goto(origin+'/markless/concepts/state');
    record.initialFrameworkRequests = frameworkRequests(record).length;
    assert.equal(record.initialFrameworkRequests,5);
    const computed = page.locator('a[href="/markless/concepts/computed"]').first();
    const loaded = new Set(); page.on('requestfinished',request=>loaded.add(request.url()));
    await page.coverage.startJSCoverage({resetOnNavigation:false});
    await computed.hover();
    await expect.poll(()=>frameworkRequests(record).length).toBe(6);
    const destination = frameworkRequests(record).at(-1).url;
    await expect.poll(()=>loaded.has(destination)).toBe(true);
    const coverage = await page.coverage.stopJSCoverage();
    record.hoverDestination = destination;
    record.hoverDestinationExecuted = coverage.some(entry=>entry.url===destination && entry.functions.some(fn=>fn.ranges.some(range=>range.count>0)));
    assert.equal(record.hoverDestinationExecuted,false);
    await computed.click();
    await expect(page).toHaveURL(origin+'/markless/concepts/computed');
    const addShirt = page.getByRole('button',{name:'Add a shirt',exact:true}).first();
    await expect(addShirt).toBeVisible();
    await addShirt.click();
    await expect(page.getByText('Total: 40',{exact:true})).toBeVisible();
    assert.equal(record.requests.filter(request=>request.type==='document').length,1);
    await page.locator('.mode-select-trigger').click();
    await page.getByRole('option',{name:'UI',exact:true}).click();
    await expect(page).toHaveURL(origin+'/markless/ui');
    const documentsAfterModeChange=record.requests.filter(request=>request.type==='document').length;
    await page.locator('.branch-trigger').filter({hasText:'Show and hide'}).click();
    const accordion = page.locator('a[href="/markless/ui/accordion"]').first();
    await accordion.hover(); await accordion.click();
    await expect(page).toHaveURL(origin+'/markless/ui/accordion');
    const trigger = page.locator('.pg[data-family="accordion"] .pg-stage .trigger').nth(1);
    await expect(trigger).toBeVisible(); await trigger.click(); await expect(trigger).toHaveAttribute('aria-expanded','true');
    await page.screenshot({path:directory+'/accordion-after-navigation.png'});
    await page.goBack(); await expect(page).toHaveURL(origin+'/markless/ui');
    await expect(page.getByRole('heading',{name:'Components you style yourself'})).toBeVisible();
    await page.goForward(); await expect(page).toHaveURL(origin+'/markless/ui/accordion');
    await expect(trigger).toBeVisible();
    const before = await trigger.getAttribute('aria-expanded');
    const requestsBeforeOffline = record.requests.length;
    await context.setOffline(true); await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded',String(before!=='true'));
    record.offlineAdditionalRequests = record.requests.slice(requestsBeforeOffline);
    assert.equal(record.offlineAdditionalRequests.length,0);
    assert.equal(record.requests.filter(request=>request.type==='document').length,documentsAfterModeChange);
    assert.deepEqual(record.errors,[]);
  });
  const requestedFiles = [...new Set(frameworkRequests(records[0]).map(request => new URL(request.url).pathname.split('/').at(-1)))];
  const sizes = await Promise.all(requestedFiles.map(async file=>({file,bytes:(await stat(output+'/public/build/'+file)).size})));
  const shared = sizes.sort((a,b)=>b.bytes-a.bytes)[0].file;
  await visit('delayed shared pack keeps controls visible and retains the click', async ({page,record}) => {
    let release;
    const held = new Promise(resolve=>release=resolve);
    let waiting = false;
    await page.route('**/build/'+shared,async route=>{waiting=true;await held;await route.continue();});
    try {
      await page.goto(origin+'/markless/concepts/state',{waitUntil:'commit'});
      const button = page.getByRole('button',{name:'Clicked 0 times',exact:true}).first();
      await expect(button).toBeVisible(); await expect(button).toBeEnabled();
      await expect.poll(()=>waiting).toBe(true);
      await button.click({noWaitAfter:true});
      assert.equal(await button.textContent(),'Clicked 0 times');
      record.visibleDuringDelay = true;
      release();
      await expect(page.getByRole('button',{name:'Clicked 1 times',exact:true}).first()).toBeVisible();
      assert.deepEqual(record.errors,[]);
    } finally {release();}
  });
  await visit('failed shared pack remains an observable failure', async ({page,record}) => {
    await page.route('**/build/'+shared,route=>route.abort('failed'));
    await page.goto(origin+'/markless/concepts/state',{waitUntil:'domcontentloaded'});
    const button = page.getByRole('button',{name:'Clicked 0 times',exact:true}).first();
    await expect(button).toBeVisible(); await button.click();
    await expect.poll(()=>record.errors.length).toBeGreaterThan(0);
    assert.equal(await button.textContent(),'Clicked 0 times');
    record.expectedNetworkFailure = true;
  });
} finally {
  if(browser) await browser.close();
  if(server.exitCode===null){server.kill('SIGTERM');await new Promise(resolve=>server.once('exit',resolve));}
  await persist();
}
