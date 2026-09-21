import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { expect, test } from 'vitest';
import { markless } from '../src/vite/index.ts';
import { transformTsrxModule } from '../src/transform.ts';
import { marklessSourceAliases } from './helpers.ts';

type OverlayHost = typeof globalThis & {
	__marklessOverlay?: (root: unknown) => unknown;
	__overlayEvaluations?: number;
};
const host = globalThis as OverlayHost;

for (const shape of [
	{ name: 'Panel', tag: 'section', nested: false },
	{ name: 'FloatingSurface', tag: 'aside', nested: true },
]) {
	test(`render-data-only ${shape.name} registers a lazy root-gated capability`, async () => {
		const root = await mkdtemp(join(tmpdir(), 'markless-overlay-capability-'));
		const previous = host.__marklessOverlay;
		const evaluations = host.__overlayEvaluations;
		delete host.__marklessOverlay;
		delete host.__overlayEvaluations;
		try {
			const source = `import { shared, state } from '@markless/core';
const model = shared(() => { const data = state({ open: false }); return { ...data }; }, { scope: 'widget' });
export default function ${shape.name}() @{
 const data = model();
 <${shape.tag} overlay hidden={!data.open} onClick={() => { throw new Error('lazy-handler'); }}>content</${shape.tag}>
}`;
			await writeFile(join(root, 'surface.tsrx'), source);
			await writeFile(
				join(root, 'plain.tsrx'),
				'export default function Plain() @{ <p>plain</p> }',
			);
			await writeFile(
				join(root, 'parent.tsrx'),
				`import ${shape.name} from './surface.tsrx';\nexport default function Page() @{ <main><${shape.name} /><${shape.name} /></main> }`,
			);
			await writeFile(
				join(root, 'entry.js'),
				`export { marklessPrerenderData } from './${shape.nested ? 'parent' : 'surface'}.tsrx?markless-render-data';`,
			);
			await writeFile(
				join(root, 'plain.js'),
				"export { marklessPrerenderData } from './plain.tsrx?markless-render-data';",
			);
			const output = await build({
				configFile: false,
				root,
				logLevel: 'silent',
				resolve: { alias: marklessSourceAliases(resolve(import.meta.dirname, '../../..')) },
				plugins: [
					markless(),
					{
						name: 'observe-overlay-evaluation',
						transform(code, id) {
							if (id.endsWith('/web/src/fns/overlay.ts'))
								return `globalThis.__overlayEvaluations = (globalThis.__overlayEvaluations ?? 0) + 1;\n${code}`;
						},
					},
				],
				build: {
					write: false,
					minify: 'oxc',
					rolldownOptions: {
						input: { entry: join(root, 'entry.js'), plain: join(root, 'plain.js') },
						preserveEntrySignatures: 'exports-only',
					},
				},
			});
			const files = Array.isArray(output)
				? output.flatMap((item) => item.output)
				: output.output;
			for (const item of files) {
				const target = join(root, 'out', item.fileName);
				await mkdir(resolve(target, '..'), { recursive: true });
				await writeFile(target, item.type === 'chunk' ? item.code : item.source);
			}
			await writeFile(join(root, 'output.json'), JSON.stringify(files, null, 2));
			console.log(`Persisted capability output: ${root}`);
			const entry = files.find(
				(item) => item.type === 'chunk' && item.isEntry && item.name === 'entry',
			)!;
			const plain = files.find(
				(item) => item.type === 'chunk' && item.isEntry && item.name === 'plain',
			)!;
			const load = (file: string, suffix = '') =>
				import(pathToFileURL(join(root, 'out', file)).href + suffix);
			await load(plain.fileName);
			expect(host.__marklessOverlay).toBeUndefined();
			await load(entry.fileName);
			expect(typeof host.__marklessOverlay).toBe('function');
			expect(host.__overlayEvaluations).toBeUndefined();
			const unmarked = { querySelector: () => null };
			expect(host.__marklessOverlay!(unmarked)).toBeUndefined();
			expect(host.__overlayEvaluations).toBeUndefined();
			const marked = {
				querySelector: () => ({}),
				ownerDocument: {},
				__marklessOverlayInstalled: false,
			};
			await host.__marklessOverlay!(marked);
			expect(marked.__marklessOverlayInstalled).toBe(true);
			expect(host.__overlayEvaluations).toBe(1);
			await load(entry.fileName, '?repeat');
			const installed = host.__marklessOverlay;
			await load(plain.fileName, '?repeat');
			expect(host.__marklessOverlay).toBe(installed);
			await host.__marklessOverlay!(marked);
			expect(host.__overlayEvaluations).toBe(1);
			const compiled = await transformTsrxModule({
				filename: join(root, 'surface.tsrx'),
				source,
				environment: 'client',
			});
			const ids = files.flatMap((item) =>
				item.type === 'chunk' ? item.moduleIds.map((id) => id.replace(/^\0/, '')) : [],
			);
			for (const symbol of compiled.manifest.symbols.filter(
				(symbol) => symbol.kind === 'event-handler',
			))
				expect(ids).not.toContain(symbol.virtualModuleId);
		} finally {
			if (previous) host.__marklessOverlay = previous;
			else delete host.__marklessOverlay;
			if (evaluations === undefined) delete host.__overlayEvaluations;
			else host.__overlayEvaluations = evaluations;
		}
	});
}

test.each(['client', 'server'] as const)(
	'overlay registration respects the %s environment',
	async (environment) => {
		const result = await transformTsrxModule({
			filename: '/workspace/Surface.tsrx',
			source: 'export default function Surface() @{ <div overlay>content</div> }',
			environment,
			prerenderRecords: true,
		});
		const source = result.virtualModules.find(
			(module) => module.type === 'render-data',
		)!.source;
		expect(source.includes('__marklessOverlay')).toBe(environment === 'client');
	},
);
