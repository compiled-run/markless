import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as debugChannelModule from '../../web/src/debug-channel.ts';
import {
	__marklessDebugResetForTest,
	__marklessDebugStartContainer,
} from '../../web/src/debug-channel.ts';
import {
	__marklessRouterStartSpaNavigation,
	type MarklessRouterNavigationWindow,
} from '../src/spa-navigation.ts';
import { createServerEntry } from '../src/vite/runtime/create-server-entry.ts';
import type { MarklessDebugChannelV1 } from '../../web/src/debug-channel.ts';

function requiredScriptContent(text: string, pattern: RegExp): string {
	const match = text.match(pattern);
	if (!match || match[1] === undefined) throw new Error('expected script content matching ' + String(pattern));
	return match[1];
}


const debugChannel = () =>
	(globalThis as typeof globalThis & { __MARKLESS_DEBUG__?: MarklessDebugChannelV1 })
		.__MARKLESS_DEBUG__;

function anchor(root: object, attributes: Record<string, string> = {}) {
	return {
		isConnected: true,
		parentElement: root,
		tagName: 'A',
		href: attributes.href ?? 'http://router.test/about',
		hasAttribute(name: string) {
			return name in attributes;
		},
		getAttribute(name: string) {
			return attributes[name] ?? null;
		},
		relList: {
			contains: (value: string) => attributes.rel?.split(' ').includes(value) ?? false,
		},
		closest(selector: string) {
			return selector === 'a[href]' ? this : null;
		},
	};
}

beforeEach(() => {
	(globalThis as Record<string, unknown>).__MARKLESS_DEBUG_ENABLED__ = true;
	(globalThis as Record<string, unknown>).location = { href: 'http://router.test/' };
	__marklessDebugResetForTest();
});

afterEach(() => vi.restoreAllMocks());

describe('router debug registration', () => {
	test('SPA listeners explain marked eligible anchors and reject native or external links', async () => {
		const root = {
			isConnected: true,
			contains(value: unknown) {
				return (
					value === this || (value as { parentElement?: unknown }).parentElement === this
				);
			},
		};
		const marked = anchor(root, {
			href: 'http://router.test/about',
			'data-markless-router-link': '',
		});
		const native = anchor(root, { href: 'http://router.test/about' });
		const external = anchor(root, {
			href: 'https://elsewhere.test/',
			'data-markless-router-link': '',
			rel: 'external',
		});
		__marklessDebugStartContainer(root as never, 'ssr-resume');
		const runtimeWindow = {
			document: new EventTarget(),
			location: { href: 'http://router.test/' },
			addEventListener() {},
			navigation: { addEventListener() {}, navigate() {} },
		} as unknown as MarklessRouterNavigationWindow;

		await __marklessRouterStartSpaNavigation({
			pageModuleLoaders: {},
			routeFileIds: [],
			window: runtimeWindow,
		});

		expect(debugChannel()?.explainInteraction(marked as never, 'click')).toMatchObject({
			kind: 'router-delegation',
			source: 'spa-click-listener',
		});
		expect(debugChannel()?.explainInteraction(marked as never, 'navigate')).toMatchObject({
			kind: 'router-delegation',
			source: 'navigation-event',
		});
		expect(debugChannel()?.explainInteraction(native as never, 'click')).toMatchObject({
			kind: 'none',
			reason: 'not-registered',
		});
		expect(debugChannel()?.explainInteraction(external as never, 'click')).toMatchObject({
			kind: 'none',
			reason: 'not-registered',
		});
	});

	test('lazy SPA startup records delegation for a later active CSR container', async () => {
		const runtimeWindow = {
			document: new EventTarget(),
			location: { href: 'http://router.test/' },
			addEventListener() {},
			navigation: { addEventListener() {}, navigate() {} },
		} as unknown as MarklessRouterNavigationWindow;
		await __marklessRouterStartSpaNavigation({
			pageModuleLoaders: {}, routeFileIds: [], window: runtimeWindow,
		});
		const root = {
			isConnected: true,
			contains(value: unknown) {
				return value === this || (value as { parentElement?: unknown }).parentElement === this;
			},
		};
		const link = anchor(root, {
			href: 'http://router.test/lazy', 'data-markless-router-link': '',
		});
		__marklessDebugStartContainer(root as never, 'csr');
		expect(debugChannel()?.explainInteraction(link as never, 'click')).toMatchObject({
			kind: 'router-delegation',
			source: 'spa-click-listener',
		});
	});

	test('SSR output executes its initial-link bridge registration', async () => {
		const entry = createServerEntry({
			navigationEntryPath: '/navigation.js',
			pageModuleLoaders: {
				'pages/index.tsrx': async () => ({
					default: {
						renderSsr: async () => ({
							html: '<a data-markless-router-link href="/about">About</a>',
						}),
					},
				}),
			},
			routeFileIds: ['pages/index.tsrx'],
		});

		const response = await entry.fetch(new Request('http://router.test/'));
		const html = await response.text();
		const debugBootstrap = requiredScriptContent(
			html,
			/<script data-markless-router-debug-bootstrap>([\s\S]*?)<\/script>/,
		);
		const source = requiredScriptContent(html, /<script data-markless-router-link-resumer>([\s\S]*?)<\/script>/);
		const root: any = {
			isConnected: true,
			listeners: new Map(),
			contains(value: unknown) {
				return value === this || (value as any).parentElement === this;
			},
			addEventListener(name: string, listener: unknown) {
				this.listeners.set(name, listener);
			},
		};
		const link = anchor(root, {
			href: 'http://router.test/about',
			'data-markless-router-link': '',
		});
		const previousDocument = (globalThis as any).document;
		(globalThis as any).document = { currentScript: { closest: () => root } };
		(globalThis as any).location = {
			href: 'http://router.test/',
			origin: 'http://router.test',
			hash: '',
			assign() {},
		};
		try {
			new Function(debugBootstrap)();
			new Function(source)();
		} finally {
			(globalThis as any).document = previousDocument;
		}
		expect(root.listeners.has('click')).toBe(true);
		expect(debugChannel()?.explainInteraction(link as never, 'click')).toMatchObject({
			kind: 'router-delegation',
			source: 'ssr-link-bridge',
		});
		const csrRoot = {
			isConnected: true,
			contains(value: unknown) {
				return value === this || (value as { parentElement?: unknown }).parentElement === this;
			},
		};
		const csrLink = anchor(csrRoot, {
			href: 'http://router.test/csr', 'data-markless-router-link': '',
		});
		__marklessDebugStartContainer(csrRoot as never, 'csr');
		expect(debugChannel()?.explainInteraction(csrLink as never, 'click')).toMatchObject({
			kind: 'router-delegation',
			source: 'ssr-link-bridge',
		});
	});

	test('built bridge records after registration without runtime source compilation', async () => {
		const entry = createServerEntry({
			navigationEntryPath: '/build/navigation.js',
			pageModuleLoaders: {
				'pages/index.tsrx': async () => ({
					default: {
						renderSsr: async () => ({
							html: '<a data-markless-router-link href="/about">About</a>',
						}),
					},
				}),
			},
			routeFileIds: ['pages/index.tsrx'],
		});
		const html = await (await entry.fetch(new Request('http://router.test/'))).text();
		const source = requiredScriptContent(
			html,
			/<script data-markless-router-link-resumer>([\s\S]*?)<\/script>/,
		);
		const debugBootstrap = requiredScriptContent(
			html,
			/<script data-markless-router-debug-bootstrap>([\s\S]*?)<\/script>/,
		);
		const root: any = {
			isConnected: true,
			listeners: new Map(),
			contains(value: unknown) {
				return value === this || (value as any).parentElement === this;
			},
			addEventListener(name: string, listener: unknown) {
				this.listeners.set(name, listener);
			},
		};
		const link = anchor(root, {
			href: 'http://router.test/about',
			'data-markless-router-link': '',
		});
		const previousDocument = (globalThis as any).document;
		(globalThis as any).document = { currentScript: { closest: () => root } };
		(globalThis as any).location = {
			href: 'http://router.test/',
			origin: 'http://router.test',
			hash: '',
		};
		try {
			new Function(debugBootstrap)();
			new Function('Function', source)(() => {
				throw new EvalError('unsafe-eval blocked');
			});
		} finally {
			(globalThis as any).document = previousDocument;
		}

		expect(root.listeners.has('click')).toBe(true);
		expect(debugChannel()?.explainInteraction(link as never, 'click')).toMatchObject({
			kind: 'router-delegation',
			source: 'ssr-link-bridge',
		});
		debugChannelModule.__marklessDebugRegisterRouter(undefined, 'navigation-event');
		expect(debugChannel()?.explainInteraction(link as never, 'navigate')).toMatchObject({
			kind: 'router-delegation',
			source: 'navigation-event',
		});
	});

	test.each(['undefined', 'function (this is not valid JavaScript)'])(
		'SSR link bridge still registers when generated debug bootstrap is %s',
		async (bootstrapSource) => {
			vi.spyOn(debugChannelModule, '__marklessDebugBootstrapSource').mockReturnValue(
				bootstrapSource,
			);
			const entry = createServerEntry({
				navigationEntryPath: '/navigation.js',
				pageModuleLoaders: {
					'pages/index.tsrx': async () => ({
						default: {
							renderSsr: async () => ({
								html: '<a data-markless-router-link href="/about">About</a>',
							}),
						},
					}),
				},
				routeFileIds: ['pages/index.tsrx'],
			});
			const response = await entry.fetch(new Request('http://router.test/'));
			const source = requiredScriptContent(
				await response.text(),
				/<script data-markless-router-link-resumer>([\s\S]*?)<\/script>/,
			);
			const root = {
				listeners: new Map<string, unknown>(),
				addEventListener(name: string, listener: unknown) {
					this.listeners.set(name, listener);
				},
			};
			const previousDocument = (globalThis as { document?: unknown }).document;
			(globalThis as { document?: unknown }).document = {
				currentScript: { closest: () => root },
			};
			try {
				expect(() => new Function(source)()).not.toThrow();
			} finally {
				(globalThis as { document?: unknown }).document = previousDocument;
			}
			expect(root.listeners.has('click')).toBe(true);
		},
	);
});
