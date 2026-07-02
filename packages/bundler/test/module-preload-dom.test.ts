import { describe, expect, test } from 'vitest';
import {
	appendModulePreloadLinks,
	lazySymbolPreloadRootsFromView,
	preloadLazySymbolModules,
} from '../src/build/module-preload-dom.ts';
import { convertManifestToBundleGraph } from '../src/build/bundle-graph.ts';
import type { MarklessManifest } from '../src/types.ts';

describe('CSR module preload DOM helpers', () => {
	test('extracts lazy symbol roots from the rendered view without render entry chunks', () => {
		const roots = lazySymbolPreloadRootsFromView({
			events: [
				{ symbolIds: ['symbol:event', 'symbol:shared'] },
				{ symbolIds: ['symbol:event'] },
			],
			domUpdates: [{ symbolId: 'symbol:text' }, { symbolId: 'symbol:shared' }],
			behaviors: [{ symbolId: 'symbol:behavior' }],
			asyncBoundaries: [
				{ asyncReads: [{ runnerSymbolId: 'symbol:async' }, { runnerSymbolId: undefined }] },
			],
		});

		expect(roots).toEqual([
			{ name: 'symbol:event', priority: 'high' },
			{ name: 'symbol:shared', priority: 'high' },
			{ name: 'symbol:behavior', priority: 'high' },
			{ name: 'symbol:text', priority: 'low' },
			{ name: 'symbol:async', priority: 'low' },
		]);
	});

	test('plans from lazy symbol roots and appends deduped modulepreload links', () => {
		const graph = convertManifestToBundleGraph(manifestWithLazySymbolDeps());
		const document = fakeDocument(['/assets/build/shared.js']);

		const result = preloadLazySymbolModules({
			base: '/assets/',
			bundleGraph: graph,
			document,
			view: {
				events: [{ symbolIds: ['symbol:press'] }],
				domUpdates: [{ symbolId: 'symbol:text' }],
			},
		});

		expect(result.planned.map((preload) => preload.href)).toEqual([
			'/assets/build/shared.js',
			'/assets/build/press.js',
			'/assets/build/text.js',
		]);
		expect(result.appendedHrefs).toEqual(['/assets/build/press.js', '/assets/build/text.js']);
		expect(document.appended).toMatchObject([
			{
				crossOrigin: 'anonymous',
				href: '/assets/build/press.js',
				rel: 'modulepreload',
			},
			{
				crossOrigin: 'anonymous',
				href: '/assets/build/text.js',
				rel: 'modulepreload',
			},
		]);
		expect(document.appended[0]?.attributes.fetchpriority).toBe('high');
		expect(document.appended[1]?.attributes.fetchpriority).toBe('low');
	});

	test('appendModulePreloadLinks is a no-op when the document is unavailable', () => {
		expect(
			appendModulePreloadLinks([
				{
					fetchPriority: 'high',
					href: '/build/handler.js',
					name: 'handler.js',
					priority: 'high',
					probability: 1,
				},
			]),
		).toEqual([]);
	});
});

function fakeDocument(existingHrefs: readonly string[] = []) {
	const existing = existingHrefs.map((href) => fakeLink(href));
	const appended: Array<ReturnType<typeof fakeLink>> = [];
	return {
		appended,
		baseURI: 'http://fixture.local/',
		head: {
			appendChild(link: ReturnType<typeof fakeLink>) {
				appended.push(link);
			},
		},
		createElement() {
			return fakeLink('');
		},
		querySelectorAll(selector: string) {
			return selector === 'link[rel="modulepreload"]' ? existing : [];
		},
	};
}

function fakeLink(initialHref: string) {
	return {
		attributes: {} as Record<string, string>,
		crossOrigin: '',
		href: initialHref,
		rel: 'modulepreload',
		getAttribute(name: string) {
			return name === 'href' ? this.href : (this.attributes[name] ?? null);
		},
		setAttribute(name: string, value: string) {
			this.attributes[name] = value;
		},
	};
}

function manifestWithLazySymbolDeps(): MarklessManifest {
	return {
		version: 1,
		modules: [
			{
				source: '/workspace/app/src/root.tsrx',
				payload: { virtualModuleId: 'virtual:markless:payload:root' },
				resolver: { virtualModuleId: 'virtual:markless:resolver:root' },
				symbols: [
					{
						symbolId: 'symbol:press',
						kind: 'event-handler',
						exportName: 'onPress',
						virtualModuleId: 'virtual:markless:symbol:root:press',
						fileName: 'build/press.js',
					},
					{
						symbolId: 'symbol:text',
						kind: 'dom-update',
						exportName: 'text',
						virtualModuleId: 'virtual:markless:symbol:root:text',
						fileName: 'build/text.js',
					},
				],
			},
		],
		bundles: {
			'build/press.js': {
				size: 900,
				total: 1900,
				imports: ['build/shared.js'],
				symbols: ['symbol:press'],
				origins: ['src/root.tsrx'],
			},
			'build/text.js': {
				size: 500,
				total: 1500,
				imports: ['build/shared.js'],
				symbols: ['symbol:text'],
				origins: ['src/root.tsrx'],
			},
			'build/shared.js': {
				size: 500,
				total: 500,
				origins: ['src/shared.ts'],
			},
		},
	};
}
