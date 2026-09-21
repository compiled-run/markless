import { mkdtempSync, readFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareDocsData, docsData, type DocsInputs } from './docs-data.ts';
import { fillPageProps } from './page-props.ts';
import { scenes } from '../components/docs/anatomy/scenes.ts';
import { manifest } from '../components/docs/api-derive/manifest.ts';
import { metaIfAny } from '../components/docs/ui-meta/index.ts';
import { deriveApiSections, paintApiSections } from '../components/docs/api-derive/model.ts';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const setup = () => {
	const root = mkdtempSync(join(tmpdir(), 'docs-data-'));
	roots.push(root);
	return { root, id: join(root, 'pages/markless/ui/accordion.mdx') };
};
const inputs: DocsInputs = { manifest, scenes, order: (family) => metaIfAny(family)?.partOrder };
const api = "import ApiTable from '../../../components/docs/api-table.tsrx';\n\n";
const anatomy = "import AnatomyTable from '../../../components/docs/anatomy-table.tsrx';\n\n";

describe('static docs data', () => {
	it.each(['accordion', 'tabs'])(
		'prepares default and explicit %s API sections with original ordering',
		async (family) => {
			const { root, id } = setup();
			const source =
				family === 'accordion'
					? fillPageProps(api + '<ApiTable />', id)
					: api + `<ApiTable family="${family}" />`;
			const result = await prepareDocsData(source, id, root, inputs);
			expect(result.modules).toHaveLength(1);
			expect(result.modules[0]!.data).toEqual(
				paintApiSections(
					deriveApiSections(family, manifest[family]!, inputs.order(family)),
				),
			);
			expect(result.code).not.toContain('api-table.tsrx');
			expect(result.modules[0]!.source).toContain('api-table-view.tsrx');
			expect(result.modules[0]!.source).not.toContain('api-derive');
		},
	);
	it('preserves explicit part, empty sections, required/default descriptions and escaped data', async () => {
		const { root, id } = setup();
		const result = await prepareDocsData(
			api + '<ApiTable family="accordion" part="itemcontent" />',
			id,
			root,
			inputs,
		);
		expect(result.modules[0]!.data).toEqual([
			{ id: '', name: '', headed: false, empty: true, rows: [] },
		]);
		const data = paintApiSections(
			deriveApiSections('demo', {
				parts: [
					{
						part: 'root',
						component: 'Root',
						props: [
							{
								name: 'title',
								type: 'string',
								required: true,
								default: '"<&雪>"',
								doc: 'Use `code` & <text>.',
							},
						],
					},
				],
			}),
		);
		expect(data[0]!.rows[0]!.pieces.map((p) => p.text).join('')).toBe(
			'Required. Use code & <text>. Default "<&雪>".',
		);
		const custom = await prepareDocsData(api + '<ApiTable family="demo" />', id, root, {
			...inputs,
			manifest: {
				demo: {
					parts: [
						{
							part: 'root',
							component: 'Root',
							props: [
								{
									name: 'x',
									type: 'string',
									required: true,
									doc: '`</script>` 雪',
								},
							],
						},
					],
				},
			},
		});
		expect(custom.modules[0]!.source).toContain('雪');
		expect(custom.modules[0]!.data).toEqual(
			paintApiSections(
				deriveApiSections('demo', {
					parts: [
						{
							part: 'root',
							component: 'Root',
							props: [
								{
									name: 'x',
									type: 'string',
									required: true,
									doc: '`</script>` 雪',
								},
							],
						},
					],
				}),
			),
		);
	});
	it('keeps fences, inline examples, dynamic/rows/children/spread and unsupported imports unchanged', async () => {
		const { root, id } = setup();
		const tail =
			'```mdx\n<ApiTable family="tabs" />\n```\n\n`<ApiTable family="tabs" />`\n\n<ApiTable family={name} />\n\n<ApiTable rows={rows} />\n\n<ApiTable family="tabs" {...props} />\n\n<ApiTable family="tabs">content</ApiTable>';
		const result = await prepareDocsData(api + tail, id, root, inputs);
		expect(result.modules).toHaveLength(0);
		expect(result.code).toBe(api + tail);
		for (const source of [
			'import { ApiTable } from \'../../../components/docs/api-table.tsrx\';\n\n<ApiTable family="tabs" />',
			'import ApiTable from \'./unrelated.tsrx\';\n\n<ApiTable family="tabs" />',
		]) {
			expect((await prepareDocsData(source, id, root, inputs)).code).toBe(source);
		}
	});
	it('supports verified aliases, Unicode positions and mixed static/dynamic uses without dropping fallback', async () => {
		const { root, id } = setup();
		const source =
			api.replace('ApiTable', 'Props') +
			'😎 snow 雪\n\n<Props family="tabs" />\n\n<Props family={name} />';
		const result = await prepareDocsData(source, id, root, inputs);
		expect(result.modules).toHaveLength(1);
		expect(result.code).toContain('😎 snow 雪');
		expect(result.code).toContain('<Props family={name} />');
		expect(result.code).toContain('api-table.tsrx');
	});
	it.each(['accordion', 'tabs'])(
		'prepares independent %s anatomy data and compiles generated modules',
		async (family) => {
			const { root, id } = setup();
			const result = await prepareDocsData(
				anatomy + `<AnatomyTable family="${family}" />`,
				id,
				root,
				inputs,
			);
			expect(result.modules).toHaveLength(1);
			expect(result.modules[0]!.source).toContain('anatomy-table-view.tsrx');
			expect(result.modules[0]!.source).not.toContain('manifest');
			const require = createRequire(import.meta.url),
				compiler = createRequire(require.resolve('@markless/core')).resolve(
					'@markless/compiler',
				);
			const { compileTsrxModule } = await import(pathToFileURL(compiler).href);
			const compiled = await compileTsrxModule({
				filename: result.modules[0]!.file,
				source: result.modules[0]!.source,
				symbols: [],
			});
			expect(compiled.semanticGraph.components).toHaveLength(1);
		},
	);
	it('updates changed input atomically and keeps unchanged generated files stable', async () => {
		const { root, id } = setup(),
			source = api + '<ApiTable family="accordion" />';
		const first = await prepareDocsData(source, id, root, inputs),
			file = first.modules[0]!.file,
			stamp = statSync(file).mtimeMs;
		await prepareDocsData(source, id, root, inputs);
		expect(statSync(file).mtimeMs).toBe(stamp);
		const next = { ...inputs, order: () => ['item', 'root'] };
		const changed = await prepareDocsData(source, id, root, next);
		expect(changed.modules[0]!.file).toBe(file);
		expect(changed.modules[0]!.data).not.toEqual(first.modules[0]!.data);
		expect(readFileSync(file, 'utf8')).toBe(changed.modules[0]!.source);
		const results = await Promise.all(
			Array.from({ length: 4 }, () => prepareDocsData(source, id, root, next)),
		);
		expect(results.every((r) => r.modules[0]!.source === readFileSync(file, 'utf8'))).toBe(
			true,
		);
	});
	it('restarts for manifest, family metadata and anatomy inputs to refresh the module graph', async () => {
		const plugin = docsData();
		const restart = vi.fn(async () => {});
		const hook = plugin.handleHotUpdate as (ctx: unknown) => Promise<unknown>;
		for (const file of [
			resolve('../packages/headless/components/api/manifest.json'),
			resolve('components/docs/ui-meta/accordion.ts'),
			resolve('components/docs/anatomy/scenes.ts'),
		])
			await hook({ file, server: { restart } });
		expect(restart).toHaveBeenCalledTimes(3);
	});
});

it.each(['Api$', '表'])('retains unusual binding %s for mixed dynamic uses', async (name) => {
	const { root, id } = setup();
	const source =
		api.replace('ApiTable', name) + `<${name} family="tabs" />\n\n<${name} family={name} />`;
	const result = await prepareDocsData(source, id, root, inputs);
	expect(result.code).toContain(`import ${name} from`);
	expect(result.code).toContain(`<${name} family={name} />`);
});
it('refreshes generated API descriptions and anatomy scene data when inputs change', async () => {
	const { root, id } = setup(),
		source =
			api +
			anatomy +
			'<ApiTable family="accordion" />\n\n<AnatomyTable family="accordion" />';
	const first = await prepareDocsData(source, id, root, inputs);
	const updated = structuredClone(manifest);
	const family = updated.accordion!;
	const part = family.parts.find((p) => p.part === 'root')!;
	const altered = {
		...updated,
		accordion: {
			parts: family.parts.map((p) =>
				p === part
					? {
							...p,
							props: p.props.map((q, i) =>
								i === 0 ? { ...q, doc: 'Changed API description' } : q,
							),
						}
					: p,
			),
		},
	};
	const scene = inputs.scenes.accordion!;
	const next = await prepareDocsData(source, id, root, {
		...inputs,
		manifest: altered,
		scenes: { ...inputs.scenes, accordion: { ...scene, caption: 'Changed diagram caption' } },
	});
	expect(next.modules.map((m) => m.file)).toEqual(first.modules.map((m) => m.file));
	expect(next.modules[0]!.data).not.toEqual(first.modules[0]!.data);
	expect(next.modules[1]!.data).not.toEqual(first.modules[1]!.data);
});
