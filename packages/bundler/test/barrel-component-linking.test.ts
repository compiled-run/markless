import { expect, test, vi } from 'vitest';
import { dirname, resolve } from 'pathe';
import { existsSync, readFileSync } from 'node:fs';
import { marklessClient } from '../src/rolldown.ts';
import { moduleIdFor } from '../src/module-id.ts';
import { callBuildStart, callLoad, callTransform } from './helpers.ts';

// A headless component package ships its parts through a barrel, and an app may
// alias what it imports. Both hide the module that owns a child's render data,
// so the linker has to resolve the export back to the declaring `.tsrx` file
// before prerender data can name it.

const fixtures = resolve(import.meta.dirname, 'fixtures/barrel-components');
const appFilename = `${fixtures}/App.tsrx`;

function fileResolve() {
	return vi.fn(async (specifier: string, importer?: string) => {
		if (!specifier.startsWith('.')) return null;
		const id = resolve(dirname(importer ?? appFilename), specifier);
		return existsSync(id) ? { id } : null;
	});
}

const children = [
	'checkbox/checkbox-root.tsrx',
	'checkbox/checkbox-trigger.tsrx',
	'status-badge.tsrx',
];

async function transformApp(source: string) {
	const plugin = marklessClient({ dev: true });
	const resolveId = fileResolve();
	callBuildStart(plugin, { cwd: fixtures });
	for (const child of children) {
		const filename = `${fixtures}/${child}`;
		await callTransform(plugin, readFileSync(filename, 'utf8'), filename, {
			resolve: resolveId,
		});
	}
	const result = await callTransform(plugin, source, appFilename, { resolve: resolveId });
	const renderDataId = `\0virtual:markless:render-data:${encodeURIComponent(moduleIdFor(appFilename, fixtures))}`;
	const renderData = (await callLoad(plugin, renderDataId)) as
		| { readonly code: string }
		| string
		| null;
	return {
		code: result.code as string,
		renderData: typeof renderData === 'string' ? renderData : (renderData?.code ?? ''),
	};
}

test('a parts barrel links each member tag to the module that declares the component', async () => {
	const { code, renderData } = await transformApp(
		`import { state } from '@markless/core';
import * as checkbox from './checkbox/index.ts';
export function App() @{
	let checked = state('off');
	<main><checkbox.root checked={checked}><checkbox.trigger onToggle={() => checked = 'on'} /></checkbox.root></main>
}`,
	);

	// The barrel is a plain .ts module with no render data of its own, so the
	// composition must reach the .tsrx files behind it.
	expect(code).toContain('/checkbox/checkbox-root.tsrx');
	expect(code).toContain('/checkbox/checkbox-trigger.tsrx');
	expect(code).not.toContain('/checkbox/index.ts');
	// Prerender data names children the way the child module declares them.
	expect(renderData).toContain('"CheckboxRoot"');
	expect(renderData).toContain('"CheckboxTrigger"');
});

test('a re-exported parts object resolves through both barrels', async () => {
	const { code, renderData } = await transformApp(
		`import { checkbox } from './ui.ts';
export function App() @{
	<main><checkbox.root checked={true} /></main>
}`,
	);

	expect(code).toContain('/checkbox/checkbox-root.tsrx');
	expect(code).not.toContain('./ui.ts');
	expect(renderData).toContain('"CheckboxRoot"');
});

test('an aliased import renders as the component its own module declares', async () => {
	const { renderData } = await transformApp(
		`import { StatusBadge as Badge } from './status-badge.tsrx';
export function App() @{
	<main><Badge label="Ready" /></main>
}`,
	);

	// Prerender looks the child up in its own module surface, which knows it as
	// StatusBadge; keying by the importer's local alias finds nothing.
	expect(renderData).toContain('"StatusBadge"');
	expect(renderData).not.toContain('"Badge"');
});

test('a barrel re-export that does not resolve names the specifier it could not follow', async () => {
	await expect(
		transformApp(`import * as broken from './broken-barrel.ts';
export function App() @{
	<broken.gone />
}`),
	).rejects.toThrow(/MARKLESS_COMPONENT_BARREL_UNRESOLVED.*missing-part\.tsrx/s);
});

test.each([
	[
		'namespace',
		`import * as ui from './throwing-barrel.ts';`,
		'<ui.controls.checkbox.root checked={true} />',
		'CheckboxRoot',
	],
	[
		'alias',
		`import { Notice as Message } from './throwing-barrel.ts';`,
		'<Message label="Ready" />',
		'StatusBadge',
	],
])(
	'proven %s barrel components bypass delegate execution for route and reached requests',
	async (_name, imported, markup, declared) => {
		for (const query of [
			'?markless-route',
			'?markless-render-data&markless-reached-from=' + encodeURIComponent(appFilename),
		]) {
			const importModule = vi.fn(async () => {
				throw new Error('MARKLESS_DEV_MODULE_RUNNER_UNAVAILABLE: ssr');
			});
			const plugin = marklessClient({
				dev: true,
				devServer: { importModule, transformRequest: vi.fn(async () => null) },
			});
			callBuildStart(plugin, { cwd: fixtures });
			const resolveId = fileResolve();
			for (const child of children)
				await callTransform(
					plugin,
					readFileSync(`${fixtures}/${child}`, 'utf8'),
					`${fixtures}/${child}`,
					{ resolve: resolveId },
				);
			const warn = vi.fn();
			const addWatchFile = vi.fn();
			const result = await callTransform(
				plugin,
				`${imported}\nexport function App() @{\n<main>${markup}</main>\n}`,
				appFilename + query,
				{ resolve: resolveId, warn, addWatchFile },
			);
			expect(importModule).not.toHaveBeenCalled();
			expect(addWatchFile).toHaveBeenCalledWith(`${fixtures}/throwing-barrel.ts`);
			expect(warn).not.toHaveBeenCalled();
			if (query.includes('markless-render-data')) {
				expect(result.code).toContain(declared);
				expect(result.code).not.toContain('throwing-barrel.ts');
			}
		}
	},
);

test('a mixed barrel retains genuine delegate rendering beside a compiled component', async () => {
	const importModule = vi.fn(async () => ({
		ExternalFrame: {
			renderSsr: () => ({ html: '<aside>External frame</aside>', elementCount: 1 }),
		},
	}));
	const plugin = marklessClient({
		dev: true,
		devServer: { importModule, transformRequest: vi.fn(async () => null) },
	});
	callBuildStart(plugin, { cwd: fixtures });
	const resolveId = fileResolve();
	const filename = `${fixtures}/status-badge.tsrx`;
	await callTransform(plugin, readFileSync(filename, 'utf8'), filename, { resolve: resolveId });
	const warn = vi.fn();
	const result = await callTransform(
		plugin,
		`import { Notice as Caption, ExternalFrame } from './mixed-barrel.ts';
export function App() @{
<main><Caption label="Ready" /><ExternalFrame /></main>
}`,
		appFilename +
			'?markless-render-data&markless-reached-from=' +
			encodeURIComponent(appFilename),
		{ resolve: resolveId, warn },
	);
	expect(importModule).toHaveBeenCalledExactlyOnceWith(`${fixtures}/mixed-barrel.ts`);
	expect(result.code).toContain('External frame</aside>');
	expect(result.code).toContain('"StatusBadge"');
	expect(result.code).toContain('status-badge.tsrx');
	expect(warn).not.toHaveBeenCalled();
});

test('static barrel reads are watched per importing transform including cached leaf interfaces', async () => {
	const { linkBarrelComponentInterfaces } = await import('../src/link-driver.ts');
	const { compileTsrxModuleLinkArtifact } = await import('@markless/compiler');
	const leaf = `${fixtures}/checkbox/checkbox-root.tsrx`;
	const artifact = await compileTsrxModuleLinkArtifact({
		filename: leaf,
		moduleId: 'checkbox/checkbox-root.tsrx',
		source: readFileSync(leaf, 'utf8'),
	});
	const artifacts = new Map([[leaf, artifact]]);
	const addWatchFile = vi.fn();
	const context = { resolve: fileResolve(), addWatchFile };
	const result = await linkBarrelComponentInterfaces(
		context,
		appFilename,
		[{ source: './throwing-barrel.ts' }],
		artifacts,
		undefined,
		fixtures,
	);
	expect(result.children.some((child) => child.source === leaf)).toBe(true);
	for (const dependency of [
		'throwing-barrel.ts',
		'ui.ts',
		'checkbox/index.ts',
		'checkbox/checkbox-root.tsrx',
	])
		expect(addWatchFile).toHaveBeenCalledWith(`${fixtures}/${dependency}`);
	addWatchFile.mockClear();
	await linkBarrelComponentInterfaces(
		context,
		appFilename,
		[{ source: './mixed-barrel.ts' }],
		artifacts,
		undefined,
		fixtures,
	);
	expect(addWatchFile).toHaveBeenCalledWith(`${fixtures}/mixed-barrel.ts`);
	expect(addWatchFile).not.toHaveBeenCalledWith(`${fixtures}/throwing-barrel.ts`);
	expect(addWatchFile).not.toHaveBeenCalledWith(leaf);
});
