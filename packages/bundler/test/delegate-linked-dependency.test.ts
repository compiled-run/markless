import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'pathe';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { createBuildDelegateLoader } from '../src/build/delegate-loader.ts';
import { moduleIdFor } from '../src/module-id.ts';
import { marklessClient } from '../src/rolldown.ts';
import { callBuildStart, callLoad, callTransform } from './helpers.ts';

const fixture = resolve(import.meta.dirname, '../fixtures/delegate-linked-dependency');
const directory = mkdtempSync(join(tmpdir(), 'markless-linked-delegate-'));
const packageDirectory = join(directory, 'node_modules/@fixture/delegate-linked-ui');
const packageEntry = join(packageDirectory, 'src/select/index.ts');
const selectSource = join(packageDirectory, 'src/select/select.tsrx');
const toolbarSource = join(packageDirectory, 'src/toolbar/toolbar.tsrx');
const appSource = join(directory, 'App.tsrx');
const coreEntry = resolve(import.meta.dirname, '../../core/src/index.ts');
const realSelectSource = resolve(
	import.meta.dirname,
	'../../headless/components/src/select/select.tsrx',
);

beforeAll(() => {
	cpSync(join(fixture, 'package'), packageDirectory, { recursive: true });
	cpSync(join(fixture, 'consumer/App.tsrx'), appSource);
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));

function resolveDependency(specifier: string, importer?: string) {
	if (specifier === '@fixture/delegate-linked-ui/select') return packageEntry;
	if (specifier === '@markless/core') return coreEntry;
	if (specifier.startsWith('.') && importer) return resolve(dirname(importer), specifier);
	return undefined;
}

test('a production delegate links a dependency sibling interface before compiling its importer', async () => {
	const plugin = marklessClient({ rootDir: directory });
	const warn = vi.fn();
	callBuildStart(plugin, { cwd: directory });
	await callTransform(plugin, readFileSync(appSource, 'utf8'), appSource, {
		resolve: vi.fn(async (specifier: string, importer?: string) => {
			const id = resolveDependency(specifier, importer);
			return id ? { id } : null;
		}),
		getModuleInfo: () => ({ isEntry: true }),
		warn,
	});
	const loaded = await callLoad(
		plugin,
		`\0virtual:markless:render-data:${encodeURIComponent(moduleIdFor(appSource, directory))}`,
	);
	const renderData =
		typeof loaded === 'string' ? loaded : ((loaded as { code?: string } | null)?.code ?? '');

	expect(renderData).toContain('<button data-linked-option=\\"\\">Linked option</button>');
	expect(warn.mock.calls.flat().join('\n')).not.toMatch(
		/MARKLESS_(?:STATE_HELPER_RETURN_UNSUPPORTED|DELEGATE_ARTIFACT_MISSING)/,
	);
});

test('the dev transform links the same dependency sibling before compiling select', async () => {
	const resolveId = vi.fn(async (specifier: string, importer?: string) => {
		const id = resolveDependency(specifier, importer);
		return id ? { id } : null;
	});
	let plugin: ReturnType<typeof marklessClient>;
	const transformRequest = vi.fn(async (id: string) => {
		const source = id.split('?')[0]!;
		if (source !== toolbarSource) return null;
		return await callTransform(plugin, readFileSync(source, 'utf8'), source, {
			resolve: resolveId,
		});
	});
	plugin = marklessClient({
		dev: true,
		rootDir: directory,
		devServer: { transformRequest },
	});
	callBuildStart(plugin, { cwd: directory });
	const warn = vi.fn();
	const transformed = await callTransform(
		plugin,
		readFileSync(selectSource, 'utf8'),
		selectSource,
		{ resolve: resolveId, warn },
	);

	expect((transformed as { code: string }).code).toContain(
		'shared:node_modules/@fixture/delegate-linked-ui/src/toolbar/toolbar.tsrx#toolbarState/element:itemEls',
	);
	expect(transformRequest).toHaveBeenCalledWith(toolbarSource, 'client');
	expect(warn.mock.calls.flat().join('\n')).not.toMatch(
		/MARKLESS_(?:STATE_HELPER_RETURN_UNSUPPORTED|DELEGATE_ARTIFACT_MISSING)/,
	);
});

test('the production delegate loader compiles the real select family with its toolbar interface', async () => {
	const loader = createBuildDelegateLoader();
	const loaded = (await loader.load(
		realSelectSource,
		async (specifier) => (specifier === '@markless/core' ? coreEntry : undefined),
		resolve(import.meta.dirname, '../../..'),
	)) as { SelectRoot?: { renderSsr?: unknown } };

	expect(loaded.SelectRoot?.renderSsr).toEqual(expect.any(Function));
});
