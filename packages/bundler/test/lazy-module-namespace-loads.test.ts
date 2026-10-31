import { rolldown, type OutputChunk, type Plugin } from 'rolldown';
import { parseSync } from 'rolldown/experimental';
import { expect, test } from 'vitest';
import { collectRenderedModules } from '../src/build/byte-attribution.ts';
import {
	collapseLazyModuleFacades,
	lazyModuleFacadesPlugin,
} from '../src/build/lazy-module-facades.ts';
import { namespaceLoadTexts } from '../src/build/namespace-lazy-loads.ts';
import { packTopLevelPlugin } from '../src/build/pack-top-level.ts';
import { shortExportNamesPlugin } from '../src/build/short-export-names.ts';
import { clientRouteArtifactReference } from '../src/virtual-ids.ts';

const TOP_LEVEL_AWAIT_MODULE = 'const value = await Promise.resolve(1); export default value;';

function memory(sources: Record<string, string>): Plugin {
	return {
		name: 'memory',
		resolveId: (id) => (id in sources ? id : null),
		load: (id) => sources[id],
	};
}

async function build(
	sources: Record<string, string>,
	packed: (id: string) => string | null,
	options: { minify?: boolean } = {},
) {
	let rendered = 0;
	const inputs: string[] = [];
	const facades = lazyModuleFacadesPlugin();
	const bundle = await rolldown({
		input: 'entry',
		preserveEntrySignatures: 'allow-extension',
		logLevel: 'silent',
		plugins: [
			memory(sources),
			{
				name: 'render-count',
				renderChunk(code) {
					rendered++;
					inputs.push(code);
				},
			},
			facades,
			packTopLevelPlugin(),
			shortExportNamesPlugin(() => facades.api.removedChunks()),
		],
	});
	try {
		const { output } = await bundle.generate({
			format: 'es',
			strictExecutionOrder: true,
			minifyInternalExports: false,
			minify: options.minify ?? false,
			chunkFileNames: 'chunk-[hash].js',
			codeSplitting: {
				groups: [
					{
						debugName: 'packs',
						name: packed,
						priority: 1000,
						includeDependenciesRecursively: false,
					},
				],
			},
		});
		return {
			rendered,
			inputs,
			chunks: output.filter((item): item is OutputChunk => item.type === 'chunk'),
		};
	} finally {
		await bundle.close();
	}
}

test('a router page module adds no chunk of its own for each module a page loads lazily', async () => {
	const page = '/pages/home.tsrx';
	const sources: Record<string, string> = {
		entry: `export const pages = { home: () => import(${JSON.stringify(`${page}?markless-route`)}) };`,
		[`${page}?markless-route`]: clientRouteArtifactReference(page),
		[`${page}?markless-symbols`]:
			'export const loadSymbol = { first: () => import("first"), second: () => import("second") };',
		[`${page}?markless-render-data`]: 'export const marklessPrerenderData = { title: "home" };',
		first: 'globalThis.trace?.push("first"); export const onClick = () => 1;',
		second: 'globalThis.trace?.push("second"); export const onInput = () => 2;',
	};
	const { rendered, chunks } = await build(sources, (id) =>
		id === 'entry' ? null : id.startsWith(page) ? 'route' : 'lazy',
	);
	expect(chunks.map((chunk) => chunk.moduleIds.length)).not.toContain(0);
	expect(rendered).toBe(chunks.length);
});

const lazySources: Record<string, string> = {
	entry: 'export const load = { first: () => import("first"), second: () => import("second"), registry: () => import("registry") };',
	first: 'import { shared } from "shared"; globalThis.trace?.push("first"); export let count = shared; export function read() { return count; } export default function bump() { return ++count; }',
	second: 'globalThis.trace?.push("second"); let count = 2; export { count as "odd name" }; export const write = (next) => { count = next; };',
	registry: 'globalThis.trace?.push("registry"); export const later = () => import("first");',
	shared: 'globalThis.trace?.push("shared"); export const shared = Math.max(1, 0);',
};
const lazyPack = (id: string) => (id === 'entry' || id === 'blocker' ? null : 'pack');

// Rolldown writes facade chunks only when some module of the graph awaits at its top level.
function withTopLevelAwait(sources: Record<string, string>): Record<string, string> {
	return {
		...sources,
		entry: `${sources.entry}export const blocker = () => import("blocker");`,
		blocker: TOP_LEVEL_AWAIT_MODULE,
	};
}

// Chunks named by the modules they hold, without the module that only forces facade chunks.
function comparable(chunks: readonly OutputChunk[]) {
	const names = new Map(
		chunks.map((chunk) => [chunk.fileName, `[${[...chunk.moduleIds].sort().join('+')}]`]),
	);
	const rename = (code: string) =>
		[...names].reduce((text, [from, to]) => text.replaceAll(`./${from}`, to), code);
	return chunks
		.filter((chunk) => !chunk.moduleIds.includes('blocker'))
		.map((chunk) => ({
			name: names.get(chunk.fileName),
			code: rename(chunk.code),
		}))
		.sort((a, b) => (a.name! < b.name! ? -1 : 1));
}

test('a lazy load Rolldown writes as a namespace read gets the same loader a facade chunk got', async () => {
	const facades = await build(withTopLevelAwait(lazySources), lazyPack, { minify: true });
	const namespaces = await build(lazySources, lazyPack, { minify: true });
	expect(facades.rendered).toBeGreaterThan(facades.chunks.length);
	expect(namespaces.rendered).toBe(namespaces.chunks.length);
	const pack = namespaces.chunks.find((chunk) => chunk.moduleIds.includes('first'))!;
	expect(pack.code).toContain('$ml');
	expect(pack.code).not.toMatch(/_exports\b|__exportAll/);
	const shared = (chunks: OutputChunk[]) => comparable(chunks.filter((chunk) => !chunk.isEntry));
	expect(shared(namespaces.chunks)).toEqual(shared(facades.chunks));
	const loads = (chunks: OutputChunk[]) =>
		chunks.find((chunk) => chunk.isEntry)!.code.match(/\$ml\w+/g);
	expect(loads(namespaces.chunks)).toEqual(loads(facades.chunks));
});

test('a module is measured without the namespace object its collapsed lazy loads dropped', async () => {
	const measured = async (sources: Record<string, string>) => {
		const { chunks } = await build(sources, lazyPack);
		const lengths = new Map<string, number>();
		for (const modules of collectRenderedModules(
			Object.fromEntries(chunks.map((chunk) => [chunk.fileName, chunk])) as never,
		).values())
			for (const [id, length] of modules) lengths.set(id, length);
		return ['first', 'second', 'registry'].map((id) => lengths.get(id));
	};
	expect(await measured(lazySources)).toEqual(await measured(withTopLevelAwait(lazySources)));
});

test('a namespace a module imports as a whole stays beside the loader built for a lazy load of it', async () => {
	const sources: Record<string, string> = {
		entry: 'export const load = () => import("first"); export const whole = () => import("reader");',
		first: 'globalThis.trace?.push("first"); export const value = Math.max(1, 0);',
		reader: 'import * as first from "first"; export const keys = () => Object.keys(first);',
	};
	const { chunks } = await build(sources, (id) => (id === 'entry' ? null : 'pack'));
	const pack = chunks.find((chunk) => chunk.moduleIds.includes('first'))!;
	expect(pack.code).toContain('$ml');
	expect(pack.code).toMatch(/first_exports/);
});

test('lazy namespace loads run each module once and in the order a facade load ran them', async () => {
	const run = async (sources: Record<string, string>) => {
		const { chunks } = await build(sources, lazyPack);
		const files = new Map(chunks.map((chunk) => [`./${chunk.fileName}`, chunk.code]));
		const trace: string[] = [];
		const urls = new Map<string, string>();
		for (const [name, code] of files) {
			const rewritten = code.replace(/(["'`])\.\/([\w.-]+\.js)\1/g, (_, _q, file) =>
				JSON.stringify(`@@${file}`),
			);
			urls.set(name, rewritten);
		}
		const linked = new Map<string, string>();
		const link = (name: string): string => {
			const cached = linked.get(name);
			if (cached) return cached;
			const code = urls
				.get(name)!
				.replace(/"@@([\w.-]+\.js)"/g, (_, file) => JSON.stringify(link(`./${file}`)));
			const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
			linked.set(name, url);
			return url;
		};
		const entry = chunks.find((chunk) => chunk.isEntry)!;
		(globalThis as { trace?: string[] }).trace = trace;
		try {
			const module = await import(link(`./${entry.fileName}`));
			const first = await module.load.first();
			const again = await module.load.first();
			const registry = await module.load.registry();
			const later = await registry.later();
			const second = await module.load.second();
			second.write(7);
			return {
				trace,
				same: first === again && first === later,
				count: first.read(),
				bumped: first.default(),
				odd: second['odd name'],
				keys: Object.keys(first),
			};
		} finally {
			delete (globalThis as { trace?: string[] }).trace;
		}
	};
	const facades = await run(withTopLevelAwait(lazySources));
	const namespaces = await run(lazySources);
	expect(namespaces).toEqual(facades);
	expect(namespaces.trace).toEqual(['shared', 'first', 'registry', 'second']);
});

function namespaceBundle(packCode: string, entryCode: string) {
	return {
		'entry.js': {
			type: 'chunk' as const,
			fileName: 'entry.js',
			isEntry: true,
			code: entryCode,
			imports: ['rt.js'],
			dynamicImports: ['pack.js'],
			moduleIds: ['entry'],
			exports: ['load'],
		},
		'pack.js': {
			type: 'chunk' as const,
			fileName: 'pack.js',
			code: packCode,
			imports: ['rt.js'],
			dynamicImports: [],
			moduleIds: ['a', 'b'],
			exports: ['a_exports', 'bar', 'init_a', 'b_exports', 'init_b'],
			namespaceModules: { a_exports: 'a', b_exports: 'b' },
		},
		'rt.js': {
			type: 'chunk' as const,
			fileName: 'rt.js',
			code: 'var __exportAll = (all) => all;\nvar __esmMin = (fn) => fn;\nexport { __esmMin, __exportAll };',
			imports: [],
			dynamicImports: [],
			moduleIds: ['rt'],
			exports: ['__esmMin', '__exportAll'],
		},
	};
}

test('a loader reads each export from its own binding when one local is exported under another local name', () => {
	const bundle = namespaceBundle(
		[
			'import { __esmMin, __exportAll } from "./rt.js";',
			'var a_exports = /* @__PURE__ */ __exportAll({',
			'\tx: () => foo,',
			'\ty: () => bar',
			'});',
			'var foo = 1, bar = 2;',
			'function init_a() {}',
			'var b_exports = /* @__PURE__ */ __exportAll({ z: () => foo });',
			'function init_b() {}',
			'export { a_exports, b_exports, foo as bar, init_a, init_b };',
		].join('\n'),
		'export const load = () => import("./pack.js").then((n) => (n.init_a(), n.a_exports));',
	);
	collapseLazyModuleFacades(bundle, undefined, { namespaceLoads: () => true });
	expect(bundle['pack.js'].code).toContain('get "x"(){return foo}');
	expect(bundle['pack.js'].code).toContain('get "y"(){return bar}');
});

test('text that only reads like a same-pack namespace load stays as written', () => {
	const bundle = namespaceBundle(
		[
			'import { __esmMin, __exportAll } from "./rt.js";',
			'var a_exports = /* @__PURE__ */ __exportAll({ x: () => foo });',
			'var foo = 1, bar = 2;',
			'function init_a() {}',
			'var b_exports = /* @__PURE__ */ __exportAll({ z: () => foo });',
			'function init_b() {}',
			'const text = "Promise.resolve().then(() => (init_a(), a_exports))";',
			'export const later = () => Promise.resolve().then(() => (init_b(), b_exports));',
			'export { a_exports, b_exports, foo as bar, init_a, init_b };',
		].join('\n'),
		'export const load = () => import("./pack.js").then((n) => (n.init_a(), n.a_exports));',
	);
	collapseLazyModuleFacades(bundle, undefined, { namespaceLoads: () => true });
	expect(bundle['pack.js'].code).toContain(
		'const text = "Promise.resolve().then(() => (init_a(), a_exports))";',
	);
	expect(bundle['pack.js'].code).not.toContain(
		'Promise.resolve().then(() => (init_b(), b_exports))',
	);
});

// How often code calls each named function, outside the lazy loads the facade pass replaces on purpose.
function namedCalls(code: string): Map<string, number> {
	const replaced = namespaceLoadTexts(code).flatMap((text) => {
		const spans: [number, number][] = [];
		for (let at = code.indexOf(text); at !== -1; at = code.indexOf(text, at + 1))
			spans.push([at, at + text.length]);
		return spans;
	});
	const calls = new Map<string, number>();
	const visit = (node: unknown): void => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) return node.forEach(visit);
		const syntax = node as {
			type?: string;
			start: number;
			end: number;
			callee?: { type?: string; name?: string };
		};
		if (
			syntax.type === 'CallExpression' &&
			syntax.callee?.type === 'Identifier' &&
			syntax.callee.name !== '__exportAll' &&
			!replaced.some(([start, end]) => start <= syntax.start && syntax.end <= end)
		)
			calls.set(syntax.callee.name!, (calls.get(syntax.callee.name!) ?? 0) + 1);
		for (const value of Object.values(node))
			if (value && typeof value === 'object') visit(value);
	};
	visit(parseSync('chunk.js', code).program);
	return calls;
}

test.each([
	['facade chunks', withTopLevelAwait(lazySources)],
	['namespace reads', lazySources],
])(
	'every call Rolldown rendered survives the facade, pack and export-name passes (%s)',
	async (_, sources) => {
		const { inputs, chunks } = await build(sources, lazyPack);
		const before = new Map<string, number>();
		for (const input of inputs)
			for (const [name, count] of namedCalls(input))
				before.set(name, (before.get(name) ?? 0) + count);
		const after = namedCalls(chunks.map((chunk) => chunk.code).join('\n;\n'));
		const dropped = [...before].filter(([name, count]) => (after.get(name) ?? 0) < count);
		expect(dropped).toEqual([]);
	},
);
