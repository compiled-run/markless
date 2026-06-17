import { describe, expect, test, vi } from 'vitest';
import {
	ARCADE_BUNDLE_GRAPH,
	ARCADE_MANIFEST_FILE,
	arcadeLib,
	arcadeClient,
	arcadeServer,
	transformTsrxModule,
} from '../src/rolldown.ts';
import {
	callBuildStart,
	callGenerateBundle,
	callLoad,
	callOptions,
	callResolveId,
	callTransform,
} from './helpers.ts';

const source = `
import { state } from '@arcadejs/core';

export function App() @{
	let count = state(0);

	<button onClick={() => count++}>{count}</button>
}
`;

describe('TSRX Rolldown plugin structure', () => {
	test('client build options allow generated entries to extend the app entry surface', () => {
		expect(callOptions(arcadeClient(), {})).toMatchObject({
			preserveEntrySignatures: 'allow-extension',
		});
		expect(callOptions(arcadeClient(), { preserveEntrySignatures: 'strict' })).toMatchObject({
			preserveEntrySignatures: 'strict',
		});
		expect(callOptions(arcadeServer(), {})).toEqual({});
		expect(callOptions(arcadeLib(), {})).toEqual({});
	});

	test('transformTsrxModule produces virtual payload, resolver, and symbol modules', async () => {
		const result = await transformTsrxModule({
			filename: '/workspace/app/src/App.tsrx',
			source,
		});

		expect(result.code).toContain('export const arcadeSource');
		expect(result.code).toContain(
			"import payloadScripts, { state as payloadState, view as payloadView } from 'virtual:arcade:payload:",
		);
		expect(result.code).toContain(
			"import { loadSymbol, symbolManifest } from 'virtual:arcade:resolver:",
		);
		expect(result.code).toContain(
			'export { loadSymbol, payloadScripts, payloadState, payloadView, symbolManifest };',
		);
		expect(result.code).toContain(['export default {', '\tsource: arcadeSource,', '};'].join('\n'));
		expect(result.code).not.toContain('\tpayloadScripts,');
		expect(result.code).not.toContain('\tsymbolManifest,');
		expect(result.code).not.toContain('moduleManifest');
		expect(result.code).not.toContain('module-manifest');
		expect(result.virtualModules.map((item) => item.type)).toEqual(
			expect.arrayContaining(['payload', 'resolver', 'symbol']),
		);
		expect(result.virtualModules.map((item) => item.type)).not.toContain('module-manifest');
		expect(result.manifest.source).toBe('/workspace/app/src/App.tsrx');
		expect('moduleManifest' in result.manifest).toBe(false);
		expect(result.manifest.symbols).toContainEqual(
			expect.objectContaining({
				kind: 'event-handler',
				virtualModuleId: expect.stringContaining('virtual:arcade:symbol:'),
			}),
		);
		expect(result.manifest.symbols).toContainEqual(
			expect.objectContaining({
				kind: 'dom-update',
				virtualModuleId: expect.stringContaining('virtual:arcade:symbol:'),
			}),
		);
	});

	test('base plugin transforms TSRX and serves generated virtual modules', async () => {
		const plugin = arcadeClient();

		callBuildStart(plugin, { cwd: '/workspace/app' });
		const result = (await callTransform(plugin, source, '/workspace/app/src/App.tsrx')) as {
			code: string;
		};
		const encoded = encodeURIComponent('/workspace/app/src/App.tsrx');
		const payloadId = `virtual:arcade:payload:${encoded}`;
		const resolverId = `virtual:arcade:resolver:${encoded}`;

		expect(result.code).toContain('virtual:arcade:payload:');
		expect(payloadId).toBeTruthy();
		expect(resolverId).toBeTruthy();
		expect(await callResolveId(plugin, payloadId!)).toEqual(
			expect.objectContaining({ id: `\0${payloadId}` }),
		);
		const payloadSource = (await callLoad(plugin, `\0${payloadId}`)) as string;
		expect(payloadSource).toContain('export const state =');
		expect(payloadSource).toContain('export const view =');
		expect(payloadSource).toContain('export const payloadScripts =');
		expect(payloadSource).toContain('export default payloadScripts;');
		const resolverSource = (await callLoad(plugin, `\0${resolverId}`)) as string;
		const resolverModule = (await import(
			`data:text/javascript,${encodeURIComponent(resolverSource)}`
		)) as {
			symbolManifest: [number, string | null, string | null, string[]];
		};
		const symbolIds = resolverModule.symbolManifest[3];
		const symbolSources = await Promise.all(
			symbolIds.map((symbolId) => callLoad(plugin, `\0${symbolId}`) as Promise<string>),
		);
		expect(symbolSources).toEqual(
			expect.arrayContaining([
				expect.stringContaining('context.graph.update({'),
				expect.stringContaining('type: "setText"'),
			]),
		);
	});

	test('buildStart clears stale virtual modules and transform manifests', async () => {
		let manifest:
			| {
					modules?: unknown[];
			  }
			| undefined;
		const plugin = arcadeClient({
			onManifest: (next) => {
				manifest = next;
			},
		});

		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callTransform(plugin, source, '/workspace/app/src/App.tsrx');
		const payloadId = `virtual:arcade:payload:${encodeURIComponent(
			'/workspace/app/src/App.tsrx',
		)}`;
		expect(await callLoad(plugin, `\0${payloadId}`)).toContain('export default');

		callBuildStart(plugin, { cwd: '/workspace/app' });
		expect(await callLoad(plugin, `\0${payloadId}`)).toBeNull();
		const emitFile = vi.fn();
		callGenerateBundle(plugin, {}, emitFile);
		expect(manifest?.modules).toEqual([]);
		expect(emittedAsset(emitFile, ARCADE_MANIFEST_FILE)).toBeUndefined();
	});

	test('generateBundle keeps in-memory manifest metadata without default bundle graph output', async () => {
		let manifest:
			| {
					version?: number;
					modules?: Array<{
						source?: string;
						symbols?: Array<{ fileName?: string }>;
					}>;
					bundleGraphAsset?: string;
					bundleGraph?: unknown;
			  }
			| undefined;
		const plugin = arcadeClient({
			onManifest: (next) => {
				manifest = next as never;
			},
		});
		const emitFile = vi.fn();

		callBuildStart(plugin, { cwd: '/workspace/app' });
		const result = (await callTransform(plugin, source, '/workspace/app/src/App.tsrx')) as {
			code: string;
		};
		expect(result.code).toContain('virtual:arcade:payload:');
		const encoded = encodeURIComponent('/workspace/app/src/App.tsrx');
		const entryVirtualIds = [
			`virtual:arcade:payload:${encoded}`,
			`virtual:arcade:resolver:${encoded}`,
		];
		const resolverId = `virtual:arcade:resolver:${encoded}`;
		const resolverSource = (await callLoad(plugin, `\0${resolverId}`)) as string;
		const resolverModule = (await import(
			`data:text/javascript,${encodeURIComponent(resolverSource)}`
		)) as {
			symbolManifest: [number, string | null, string | null, string[]];
		};
		const symbolVirtualIds = resolverModule.symbolManifest[3];
		const virtualIds = [...entryVirtualIds, ...symbolVirtualIds].map((id) => `\0${id}`);
		const bundle = Object.fromEntries(
			virtualIds.map((id, index) => [
				`build/chunk-${index}.js`,
				{
					type: 'chunk',
					fileName: `build/chunk-${index}.js`,
					name: `chunk-${index}`,
					code: id === `\0${resolverId}` ? resolverSource : 'export default {};',
					exports: ['default'],
					imports: [],
					dynamicImports: [],
					moduleIds: [id],
					facadeModuleId: id,
				},
			]),
		);

		callGenerateBundle(plugin, bundle, emitFile);

		expect(manifest).toMatchObject({
			version: 1,
			modules: [expect.objectContaining({ source: '/workspace/app/src/App.tsrx' })],
		});
		expect(manifest).not.toHaveProperty('bundleGraphAsset');
		expect(manifest).not.toHaveProperty('bundleGraph');
		expect(manifest?.modules[0]?.symbols[0]?.fileName).toMatch(/^chunk-\d+\.js$/);
		expect(emittedAsset(emitFile, ARCADE_BUNDLE_GRAPH)).toBeUndefined();
		expect(emittedAsset(emitFile, ARCADE_MANIFEST_FILE)).toBeUndefined();
		const resolverChunk = Object.values(bundle).find(
			(item): item is { code: string; moduleIds: string[] } =>
				typeof item === 'object' &&
				item != null &&
				'code' in item &&
				'moduleIds' in item &&
				Array.isArray(item.moduleIds) &&
				item.moduleIds.includes(`\0${resolverId}`),
		);
		expect(resolverChunk?.code).toContain('import(/* @vite-ignore */ moduleUrls[row[0]])');
		expect(resolverChunk?.code).not.toContain('switch (id)');
		expect(resolverChunk?.code).not.toContain('virtual:arcade:symbol:');
		expect(resolverChunk?.code).toMatch(/\["\.\/chunk-\d+\.js"/);
	});

	test('generateBundle emits arcade-manifest.json only when explicitly requested', () => {
		const plugin = arcadeClient({ emitManifestJson: true });
		const emitFile = vi.fn();

		callBuildStart(plugin, { cwd: '/workspace/app' });
		callGenerateBundle(plugin, {}, emitFile);

		const manifestAsset = emittedAsset(emitFile, ARCADE_MANIFEST_FILE);
		expect(manifestAsset).toMatchObject({
			type: 'asset',
			fileName: ARCADE_MANIFEST_FILE,
		});
		const manifest = JSON.parse(String(manifestAsset?.source));
		expect(manifest.modules).toEqual([]);
		expect(manifest.bundleGraph).toBeUndefined();
		expect(manifest.bundleGraphAsset).toBeUndefined();
	});
});

function emittedAsset(emitFile: ReturnType<typeof vi.fn>, fileName: string) {
	return emitFile.mock.calls.map((call) => call[0]).find((item) => item.fileName === fileName);
}
