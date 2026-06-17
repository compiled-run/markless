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

	test('transformTsrxModule produces virtual payload, resolver, manifest, and symbol modules', async () => {
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
			"import moduleManifest from 'virtual:arcade:module-manifest:",
		);
		expect(result.code).toContain(
			'export { loadSymbol, moduleManifest, payloadScripts, payloadState, payloadView, symbolManifest };',
		);
		expect(result.virtualModules.map((item) => item.type)).toEqual(
			expect.arrayContaining(['payload', 'resolver', 'module-manifest', 'symbol']),
		);
		expect(result.manifest.source).toBe('/workspace/app/src/App.tsrx');
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
		const symbolIds = [...resolverSource.matchAll(/import\("([^"]+)"\)/g)].map(
			(match) => match[1],
		);
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
		const plugin = arcadeClient();

		callBuildStart(plugin, { cwd: '/workspace/app' });
		const result = (await callTransform(plugin, source, '/workspace/app/src/App.tsrx')) as {
			code: string;
		};
		const payloadId = `virtual:arcade:payload:${encodeURIComponent(
			'/workspace/app/src/App.tsrx',
		)}`;
		expect(await callLoad(plugin, `\0${payloadId}`)).toContain('export default');

		callBuildStart(plugin, { cwd: '/workspace/app' });
		expect(await callLoad(plugin, `\0${payloadId}`)).toBeNull();
		const emitFile = vi.fn();
		callGenerateBundle(plugin, {}, emitFile);
		const manifestAsset = emitFile.mock.calls
			.map((call) => call[0])
			.find((item) => item.fileName === ARCADE_MANIFEST_FILE);
		expect(JSON.parse(manifestAsset.source).modules).toEqual([]);
	});

	test('generateBundle emits manifest and bundle graph assets from build output', async () => {
		let manifest:
			| {
					version?: number;
					modules?: Array<{
						source?: string;
						symbols?: Array<{ fileName?: string }>;
					}>;
					bundleGraphAsset?: string;
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
			`virtual:arcade:module-manifest:${encoded}`,
		];
		const resolverId = `virtual:arcade:resolver:${encoded}`;
		const resolverSource = (await callLoad(plugin, `\0${resolverId}`)) as string;
		const symbolVirtualIds = [...resolverSource.matchAll(/import\("([^"]+)"\)/g)].map(
			(match) => match[1],
		);
		const virtualIds = [...entryVirtualIds, ...symbolVirtualIds].map((id) => `\0${id}`);

		callGenerateBundle(
			plugin,
			Object.fromEntries(
				virtualIds.map((id, index) => [
					`build/async-${index}.js`,
					{
						type: 'chunk',
						fileName: `build/async-${index}.js`,
						name: `async-${index}`,
						code: 'export default {};',
						exports: ['default'],
						imports: [],
						dynamicImports: [],
						moduleIds: [id],
						facadeModuleId: id,
					},
				]),
			),
			emitFile,
		);

		expect(manifest).toMatchObject({
			version: 1,
			modules: [expect.objectContaining({ source: '/workspace/app/src/App.tsrx' })],
		});
		expect(manifest?.bundleGraphAsset).toBe(ARCADE_BUNDLE_GRAPH);
		expect(manifest?.modules[0]?.symbols[0]?.fileName).toMatch(/^async-\d+\.js$/);
		expect(emitFile).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'asset',
				fileName: ARCADE_BUNDLE_GRAPH,
			}),
		);
		expect(emitFile).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'asset',
				fileName: ARCADE_MANIFEST_FILE,
			}),
		);
	});
});
