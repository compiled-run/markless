import { createServer } from 'node:http';
import { chromium } from '@playwright/test';
import { ASYNC_PROTOCOL_VERSION } from '@markless/serializer';
import { expect, test } from 'vitest';
import { renderToString } from '../src/render-to-string.ts';

test('trusted clicks during HTML delivery reach the resumer once, in order', async () => {
	const html = await renderToString(
		{
			resumeModuleUrl: '/resume.js',
			renderSsr: () => ({
				html: '<button>Launch relay</button><output>0</output>',
				view: {
					version: ASYNC_PROTOCOL_VERSION,
					locators: [
						{ hostNodeId: 'relay', strategy: 'dom-order', index: 0, tagName: 'button' },
					],
					events: [{ hostNodeId: 'relay', eventName: 'click', symbolIds: ['launch'] }],
					domUpdates: [],
					behaviors: [],
					elementHandles: [],
					branches: [],
					repeats: [],
					asyncBoundaries: [],
				},
			}),
		},
		{ executionLog: 'never' },
	);
	const split = html.indexOf('<script type="markless/');
	expect(split).toBeGreaterThan(html.indexOf('</button>'));
	let release: () => void = () => {};
	const fetched: string[] = [];
	const server = createServer((request, response) => {
		if (request.url === '/resume.js') {
			fetched.push(request.url);
			response.setHeader('content-type', 'text/javascript');
			response.end(`export function resumeContainerEvent(input) {
				if (!input.event) return;
				(globalThis.arrivals ??= []).push({ trusted: input.event.isTrusted, type: input.event.type, time: input.event.timeStamp, host: input.eventRecord.hostNodeId });
				document.querySelector('output').textContent = String(globalThis.arrivals.length);
			}`);
		} else {
			response.setHeader('content-type', 'text/html');
			response.write('<!doctype html>' + html.slice(0, split));
			release = () => response.end(html.slice(split));
		}
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const browser = await chromium.launch({ headless: true });
	try {
		const page = await browser.newPage();
		await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/`, {
			waitUntil: 'commit',
		});
		const button = page.getByRole('button', { name: 'Launch relay' });
		await button.click({ noWaitAfter: true });
		await button.click({ noWaitAfter: true });
		expect(await page.locator('output').textContent()).toBe('0');
		expect(fetched).toEqual([]);
		release();
		await page.waitForLoadState('load');
		await expect.poll(() => page.locator('output').textContent(), { timeout: 1000 }).toBe('2');
		await button.click();
		await expect.poll(() => page.locator('output').textContent()).toBe('3');
		const arrivals = await page.evaluate(() => (globalThis as any).arrivals);
		expect(arrivals.map((item: any) => [item.trusted, item.type, item.host])).toEqual([
			[true, 'click', 'relay'],
			[true, 'click', 'relay'],
			[true, 'click', 'relay'],
		]);
		expect(arrivals.map((item: any) => item.time)).toEqual(
			arrivals.map((item: any) => item.time).sort((a: number, b: number) => a - b),
		);
		expect(fetched).toEqual(['/resume.js']);
	} finally {
		release();
		await browser.close();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
});
