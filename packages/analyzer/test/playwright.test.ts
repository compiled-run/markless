import { EventEmitter } from 'node:events';
import { describe, expect, test, vi } from 'vitest';
import {
	collectLocatorResolution,
	collectServedBuildArtifacts,
	ConsoleLedger,
	RequestLedger,
	performMatrixAction,
} from '../src/playwright.ts';

describe('Playwright adapter', () => {
	test('captures console and page errors through a page event surface', () => {
		const page = new EventEmitter();
		const ledger = new ConsoleLedger(page as never);
		page.emit('console', { type: () => 'error', text: () => 'broken' });
		page.emit('pageerror', new Error('crashed'));
		expect(ledger.assertAndClear().map(({ source }) => source)).toEqual([
			'console.error',
			'pageerror',
		]);
		ledger.detach();
	});

	test('caps a network quiet wait', async () => {
		const page = new EventEmitter();
		const ledger = new RequestLedger(page as never, {
			pageOrigin: 'https://app.test',
			knownDocumentPaths: [],
			declaredApi: [],
			phase: 'action',
		});
		const timer = setInterval(() => {
			const request = {
				method: () => 'GET',
				url: () => 'https://app.test/api/poll',
				resourceType: () => 'fetch',
			};
			page.emit('request', request);
			page.emit('requestfinished', request);
		}, 5);
		const failure = await ledger.waitForQuiet(10, 40);
		clearInterval(timer);
		expect(failure).toMatch(/network never went quiet/);
		ledger.detach();
	});

	test('performs a matrix action through locator-shaped page stubs', async () => {
		const click = vi.fn(async () => undefined);
		const page = { getByTestId: vi.fn(() => ({ click })) };
		await performMatrixAction(
			page as never,
			{ locator: { kind: 'testId', value: 'primary-control' }, operation: 'click' } as never,
		);
		expect(page.getByTestId).toHaveBeenCalledWith('primary-control');
		expect(click).toHaveBeenCalledOnce();
	});

	test('collects served HTML and build chunks from the page', async () => {
		const artifacts = [{ path: '/index.html', content: '<main />' }, { path: '/build/a.js', content: 'export{}' }];
		const page = { evaluate: vi.fn(async () => artifacts) };
		expect(await collectServedBuildArtifacts(page as never)).toEqual(artifacts);
	});

	test('adapts a serialized page Document to the locator core', async () => {
		const page = {
			evaluate: vi.fn(async () => [{
				containerId: 'document-container:0',
				root: { nodeType: 1, tagName: 'MAIN', childNodes: [] },
				view: { locators: [{ hostNodeId: 'root', strategy: 'dom-order', index: 0, tagName: 'main' }], events: [], domUpdates: [], behaviors: [], elementHandles: [], keyedRepeats: [], branches: [], asyncBoundaries: [] },
			}]),
		};
		const result = await collectLocatorResolution(page as never);
		expect(result.invariant.status).toBe('pass');
		expect(result.coverage.covered).toEqual(['dom-order-path']);
	});
});
