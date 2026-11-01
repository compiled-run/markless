import { chromium } from '@playwright/test';
const [origin, from, to] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1350, height: 940 } });
if (process.env.SLOW) {
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
}
await page.goto(origin + from, { waitUntil: 'networkidle', timeout: 120000 });
await page.evaluate(() => {
	const t0 = performance.now(); const log = (globalThis.__log = []);
	document.addEventListener('transitionrun', (e) => log.push({ at: Math.round(performance.now() - t0), kind: 'transition', prop: e.propertyName, el: e.target.localName + ' href=' + e.target.getAttribute('href') + ' active=' + e.target.getAttribute('data-active') + ' current=' + e.target.getAttribute('aria-current') + ' hover=' + e.target.matches(':hover') + ' elapsed=' + e.elapsedTime }), true);
	new MutationObserver((records) => { for (const r of records) for (const n of r.addedNodes) if (n.localName === 'link' || n.localName === 'style') log.push({ at: Math.round(performance.now() - t0), kind: 'head+', href: n.getAttribute('href') ?? n.getAttribute('data-markless-css'), media: n.getAttribute('media') }); for (const r of records) if (r.type === 'attributes') log.push({ at: Math.round(performance.now() - t0), kind: 'media', href: r.target.getAttribute('href'), media: r.target.getAttribute('media') }); for (const r of records) for (const n of r.removedNodes) if (n.localName === 'link' || n.localName === 'style') log.push({ at: Math.round(performance.now() - t0), kind: 'head-', href: n.getAttribute('href') }); }).observe(document.head, { childList: true, attributes: true, attributeFilter: ['media'], subtree: true });
	new MutationObserver((records) => { for (const r of records) { if (r.type === 'attributes' && r.target.localName === 'a') log.push({ at: Math.round(performance.now() - t0), kind: 'attr', prop: r.attributeName, el: r.target.getAttribute('href') + ' -> ' + r.target.getAttribute(r.attributeName) }); else log.push({ at: Math.round(performance.now() - t0), kind: 'body' }); } }).observe(document.body, { childList: true, subtree: true, attributes: true });
	for (const l of document.querySelectorAll('link[rel=stylesheet]')) l.addEventListener('load', () => log.push({ at: Math.round(performance.now() - t0), kind: 'load', href: l.getAttribute('href') }));
	globalThis.__titleAt = () => log.push({ at: Math.round(performance.now() - t0), kind: 'title', t: document.title });
});
await page.locator(`a[href="${to}"]`).first().click();
await page.waitForURL('**' + to);
await page.waitForTimeout(process.env.SLOW ? 6000 : 1500);
const log = await page.evaluate(() => globalThis.__log);
const body = log.filter((e) => e.kind === 'body').map((e) => e.at);
const compact = log.filter((e) => e.kind !== 'body' && !(e.href ?? '').endsWith('.js') && !(e.kind === 'head+' && e.at > 100)).map((e) => `${e.at} ${e.kind} ${(e.href ?? e.prop ?? e.t ?? '').toString().replace(/.*\//, '')} ${e.media ?? e.el ?? ''}`);
console.log(`${from} -> ${to}: body mutations ${body[0]}..${body.at(-1)}, transitions ${log.filter((e) => e.kind === 'transition').length}`);
console.log(compact.filter((line) => / (transition|media|head-) /.test(line)).join('\n'));
await browser.close();
