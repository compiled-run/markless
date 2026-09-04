import { readFileSync } from 'node:fs';
import { join, resolve } from 'pathe';
import type { EnvironmentOptions, Plugin as VitePlugin, ResolvedConfig } from 'vite';
import { vi } from 'vitest';

type FunctionHook = (this: unknown, ...args: unknown[]) => unknown;
type MockFn = ReturnType<typeof vi.fn>;

export type PluginHooks = {
	buildApp?: unknown;
	buildStart?: unknown;
	config?: unknown;
	configEnvironment?: unknown;
	configResolved?: unknown;
	configureServer?: unknown;
	generateBundle?: unknown;
	hotUpdate?: unknown;
	load?: unknown;
	options?: unknown;
	outputOptions?: unknown;
	resolveId?: unknown;
	transform?: unknown;
	transformIndexHtml?: unknown;
};

export type HookContext = {
	emitFile?: MockFn;
	error?: MockFn;
	resolve?: MockFn;
	warn?: MockFn;
	[key: string]: unknown;
};

export function getPlugin<T extends { name?: string }>(plugins: T[], name: string) {
	const plugin = plugins.find((item) => item.name === name);
	if (!plugin) {
		throw new Error(`Expected ${name} plugin`);
	}
	return plugin;
}

export function callBuildStart(
	plugin: PluginHooks,
	options: { cwd: string; input?: unknown },
	context: HookContext = {},
) {
	return getHook(plugin.buildStart, 'buildStart').call(
		{ emitFile: vi.fn(), ...context },
		options,
	);
}

export function callOutputOptions(
	plugin: PluginHooks,
	outputOptions: unknown,
	context: HookContext = {},
) {
	return getHook(plugin.outputOptions, 'outputOptions').call(context, outputOptions);
}

export function callOptions(plugin: PluginHooks, options: unknown, context: HookContext = {}) {
	return getHook(plugin.options, 'options').call(context, options);
}

export function callConfigEnvironment(
	plugin: Pick<VitePlugin, 'configEnvironment'>,
	name: string,
	config: EnvironmentOptions,
) {
	return getHook(plugin.configEnvironment, 'configEnvironment').call({}, name, config, {});
}

export function callConfig(plugin: Pick<VitePlugin, 'config'>, config: unknown, env: unknown) {
	return getHook(plugin.config, 'config').call({}, config, env);
}

export function callConfigResolved(plugin: Pick<VitePlugin, 'configResolved'>, config: unknown) {
	return getHook(plugin.configResolved, 'configResolved').call({}, config as ResolvedConfig);
}

export function callBuildApp(plugin: PluginHooks, builder: unknown, context: HookContext = {}) {
	return getHook(plugin.buildApp, 'buildApp').call(
		{
			error: errorMock(),
			warn: vi.fn(),
			...context,
		},
		builder,
	);
}

export function callTransform(
	plugin: PluginHooks,
	code: string,
	id: string,
	context: HookContext = {},
) {
	return getHook(plugin.transform, 'transform').call(
		{
			emitFile: vi.fn(),
			error: errorMock(),
			resolve: vi.fn(),
			warn: vi.fn(),
			...context,
		},
		code,
		id,
		undefined,
	);
}

export function callResolveId(
	plugin: PluginHooks,
	source: string,
	importer?: string,
	context: HookContext = {},
) {
	return getHook(plugin.resolveId, 'resolveId').call(
		{
			emitFile: vi.fn(),
			error: errorMock(),
			resolve: vi.fn(),
			warn: vi.fn(),
			...context,
		},
		source,
		importer,
		{ isEntry: false },
	);
}

export function callLoad(plugin: PluginHooks, id: string, context: HookContext = {}) {
	return getHook(plugin.load, 'load').call(context, id, undefined);
}

export function callGenerateBundle(
	plugin: PluginHooks,
	bundle: unknown,
	emitFile = vi.fn(),
	context: HookContext = {},
) {
	return getHook(plugin.generateBundle, 'generateBundle').call(
		{
			emitFile,
			error: errorMock(),
			warn: vi.fn(),
			...context,
		},
		{},
		bundle,
		false,
	);
}

export function callConfigureServer(plugin: PluginHooks, server: unknown) {
	return getHook(plugin.configureServer, 'configureServer').call({}, server);
}

export function callTransformIndexHtml(plugin: PluginHooks, html: string, context?: unknown) {
	return getHook(plugin.transformIndexHtml, 'transformIndexHtml').call({}, html, context);
}

export function callHotUpdate(plugin: PluginHooks, ctx: unknown, context: HookContext = {}) {
	return getHook(plugin.hotUpdate, 'hotUpdate').call(context, ctx);
}

export function createViteHookContext(
	consumer: 'client' | 'server' = 'client',
	build: { lib?: unknown } = {},
): HookContext {
	return {
		environment: {
			config: { consumer, build },
			name: consumer === 'server' ? 'ssr' : 'client',
		},
		emitFile: vi.fn(),
		resolve: vi.fn(),
	};
}

function errorMock() {
	return vi.fn((value: unknown) => {
		throw value instanceof Error ? value : new Error(String(value));
	});
}

function getHook(value: unknown, name: string): FunctionHook {
	if (typeof value === 'function') {
		return value as FunctionHook;
	}
	if (value && typeof value === 'object' && 'handler' in value) {
		const handler = (value as { handler?: unknown }).handler;
		if (typeof handler === 'function') {
			return handler as FunctionHook;
		}
	}
	throw new Error(`Expected function ${name} hook`);
}

// Dev-server tests resolve workspace packages by alias. Subpaths are derived from
// each package's own exports map so an alias can never point at a file the
// published package does not expose (`@markless/web/resume` is payload-full.ts).
export function marklessSourceAliases(
	root: string,
): Array<{ find: string | RegExp; replacement: string }> {
	const repo = (path: string) => resolve(root, path);
	const subpaths: Array<{ find: string | RegExp; replacement: string }> = [
		{ find: '@markless/bundler/rolldown', replacement: repo('packages/bundler/src/rolldown.ts') },
		{ find: '@markless/bundler/preload', replacement: repo('packages/bundler/src/preload.ts') },
		{ find: '@markless/bundler/vite', replacement: repo('packages/bundler/src/vite/index.ts') },
	];
	const roots: Array<{ find: string | RegExp; replacement: string }> = [];
	for (const name of ['core', 'web', 'runtime', 'serializer']) {
		const directory = repo(`packages/${name}`);
		const manifest = JSON.parse(
			readFileSync(join(directory, 'package.json'), 'utf8'),
		) as { exports: Record<string, string> };
		for (const [subpath, target] of Object.entries(manifest.exports)) {
			const specifier = `@markless/${name}${subpath.slice(1)}`;
			const file = resolve(directory, target);
			if (subpath === '.') {
				roots.push({ find: specifier, replacement: file });
			} else if (subpath.includes('*')) {
				subpaths.push({
					find: new RegExp(`^${escapeAliasPattern(specifier).replace('\\*', '(.+)')}$`),
					replacement: file.replace('*', '$1'),
				});
			} else {
				subpaths.push({ find: specifier, replacement: file });
			}
		}
	}
	// A bare package name also matches its own subpaths, so it goes last.
	return [...subpaths, ...roots];
}

function escapeAliasPattern(value: string) {
	return value.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '\\*');
}
