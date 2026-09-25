import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Plugin } from 'vite';
import type { ApiManifest } from '../components/docs/api-derive/manifest.ts';
import {
	deriveApiRows,
	deriveApiSections,
	paintApiSections,
} from '../components/docs/api-derive/model.ts';
import { deriveAnatomy } from '../components/docs/anatomy/model.ts';
import { scenes, type AnatomyScene } from '../components/docs/anatomy/scenes.ts';
import { metaIfAny } from '../components/docs/ui-meta/index.ts';

export type DocsInputs = {
	readonly manifest: ApiManifest;
	readonly scenes: Readonly<Record<string, AnatomyScene>>;
	readonly order: (family: string) => readonly string[] | undefined;
};
type Node = {
	type: string;
	name?: string;
	value?: unknown;
	children?: Node[];
	attributes?: Node[];
	position?: { start: { offset: number }; end: { offset: number } };
};
type Statement = {
	type: string;
	start: number;
	end: number;
	importKind?: string;
	source?: { value: string };
	specifiers?: { type: string; local: { name: string } }[];
};
const require = createRequire(import.meta.url);
const manifestFile = require.resolve('@markless/ui/api/manifest.json');
let parsers:
	| Promise<{
			mdxToHast: (source: string) => Node;
			parseJavaScriptModule: (source: string, filename: string) => { body: Statement[] };
	  }>
	| undefined;
function loadParsers() {
	return (parsers ??= (async () => {
		const router = createRequire(require.resolve('@markless/router/vite'));
		const core = createRequire(require.resolve('@markless/core'));
		const compiler = createRequire(core.resolve('@markless/bundler/vite'));
		const [mdx, js] = await Promise.all([
			import(pathToFileURL(router.resolve('satteri')).href),
			import(pathToFileURL(compiler.resolve('@markless/compiler')).href),
		]);
		return { mdxToHast: mdx.mdxToHast, parseJavaScriptModule: js.parseJavaScriptModule };
	})());
}
function specifier(from: string, target: string) {
	const name = relative(dirname(from), target).replaceAll('\\', '/');
	return name.startsWith('.') ? name : './' + name;
}
function writeGenerated(file: string, source: string) {
	try {
		if (readFileSync(file, 'utf8') === source) return;
	} catch {}
	mkdirSync(dirname(file), { recursive: true });
	const temporary = file + '.' + randomUUID() + '.tmp';
	writeFileSync(temporary, source);
	renameSync(temporary, file);
}
function inputs(): DocsInputs {
	return {
		manifest: JSON.parse(readFileSync(manifestFile, 'utf8')) as ApiManifest,
		scenes,
		order: (name) => metaIfAny(name)?.partOrder,
	};
}

export async function prepareDocsData(
	code: string,
	id: string,
	root: string,
	data: DocsInputs = inputs(),
) {
	const file = id.split('?', 1)[0]!;
	const modules: { file: string; source: string; kind: string; family: string; data: unknown }[] =
		[];
	const unchanged = () => ({ code, modules });
	if (!file.endsWith('.mdx')) return unchanged();
	const parser = await loadParsers();
	let tree: Node;
	try {
		tree = parser.mdxToHast(code);
	} catch {
		return unchanged();
	}
	const bindings = new Map<
		string,
		{ kind: 'api' | 'anatomy'; node: Node; statement: Statement; raw: string }
	>();
	for (const node of tree.children ?? []) {
		if (node.type !== 'mdxjsEsm' || typeof node.value !== 'string') continue;
		let program: { body: Statement[] };
		try {
			program = parser.parseJavaScriptModule(node.value, file + '.ts');
		} catch {
			return unchanged();
		}
		for (const statement of program.body) {
			if (
				statement.type !== 'ImportDeclaration' ||
				statement.importKind === 'type' ||
				statement.specifiers?.length !== 1 ||
				statement.specifiers[0]?.type !== 'ImportDefaultSpecifier' ||
				!statement.source?.value.startsWith('.')
			)
				continue;
			const imported = resolve(dirname(file), statement.source.value),
				kind =
					imported === resolve(root, 'components/docs/api-table.tsrx')
						? 'api'
						: imported === resolve(root, 'components/docs/anatomy-table.tsrx')
							? 'anatomy'
							: undefined;
			if (kind)
				bindings.set(statement.specifiers[0].local.name, {
					kind,
					node,
					statement,
					raw: node.value.slice(statement.start, statement.end),
				});
		}
	}
	const points = Array.from(code),
		edits: { start: number; end: number; text: string }[] = [],
		imports: string[] = [],
		used = new Set<string>();
	for (const node of tree.children ?? []) {
		if (
			node.type !== 'mdxJsxFlowElement' ||
			!node.name ||
			node.children?.length ||
			!node.position
		)
			continue;
		const binding = bindings.get(node.name);
		if (!binding) continue;
		const props = new Map<string, string>();
		let supported = true;
		for (const attr of node.attributes ?? []) {
			if (
				attr.type !== 'mdxJsxAttribute' ||
				!attr.name ||
				typeof attr.value !== 'string' ||
				!['family', ...(binding.kind === 'api' ? ['part'] : [])].includes(attr.name) ||
				props.has(attr.name)
			) {
				supported = false;
				break;
			}
			props.set(attr.name, attr.value);
		}
		const family = props.get('family'),
			metadata = family ? data.manifest[family] : undefined;
		if (!supported || !family || !metadata) continue;
		const original = points
			.slice(node.position.start.offset, node.position.end.offset)
			.join('');
		if (!original.startsWith('<' + node.name) || !original.trimEnd().endsWith('/>')) continue;
		let prepared: unknown;
		if (binding.kind === 'api')
			prepared = paintApiSections(
				props.has('part')
					? [
							{
								name: '',
								id: '',
								rows: deriveApiRows(family, metadata, props.get('part')!),
							},
						]
					: deriveApiSections(family, metadata, data.order(family)),
			);
		else {
			const scene = data.scenes[family];
			if (!scene) continue;
			prepared = deriveAnatomy(family, metadata, scene, data.order(family));
		}
		const hash = createHash('sha256')
				.update(
					relative(root, file).replaceAll('\\', '/') +
						'\0' +
						node.position.start.offset +
						'\0' +
						binding.kind,
				)
				.digest('hex')
				.slice(0, 16),
			local = 'PreparedDocs' + hash,
			generated = resolve(
				root,
				'components/docs/generated-data',
				binding.kind + '-' + hash + '.tsrx',
			);
		const view = resolve(
				root,
				'components/docs',
				binding.kind === 'api' ? 'api-table-view.tsrx' : 'anatomy-table-view.tsrx',
			),
			prop = binding.kind === 'api' ? 'painted' : 'data';
		const json = JSON.stringify(prepared)
			.replaceAll('<', '\\u003c')
			.replaceAll('\u2028', '\\u2028')
			.replaceAll('\u2029', '\\u2029');
		const source = `import View from ${JSON.stringify(specifier(generated, view))};\nconst data: Parameters<typeof View>[0][${JSON.stringify(prop)}] = ${json};\nexport default function ${local}() @{\n <View ${binding.kind === 'anatomy' ? `family=${JSON.stringify(family)} ` : ''}${prop}={data} />;\n}\n`;
		writeGenerated(generated, source);
		modules.push({ file: generated, source, kind: binding.kind, family, data: prepared });
		imports.push(`import ${local} from ${JSON.stringify(specifier(file, generated))};`);
		used.add(node.name);
		edits.push({
			start: node.position.start.offset,
			end: node.position.end.offset,
			text: `<${local} />`,
		});
	}
	if (!modules.length) return unchanged();
	let next = points;
	for (const edit of edits.sort((a, b) => b.start - a.start))
		next.splice(edit.start, edit.end - edit.start, ...Array.from(edit.text));
	let output = next.join('');
	for (const name of used) {
		if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
		const binding = bindings.get(name)!;
		if (!binding.raw.startsWith('import ')) continue;
		const without = output.replace(binding.raw, '');
		if (!new RegExp('\\b' + name + '\\b').test(without)) output = without;
	}
	return { code: imports.join('\n') + '\n\n' + output, modules };
}

export function docsData(): Plugin {
	let root = process.cwd();
	return {
		name: 'compiled-website:docs-data',
		enforce: 'pre',
		configResolved(config) {
			root = config.root;
		},
		async handleHotUpdate({ file, server }) {
			if (
				file === manifestFile ||
				file.includes('/components/docs/ui-meta/') ||
				file.includes('/components/docs/anatomy/') ||
				file.endsWith('/components/docs/api-derive/model.ts')
			)
				await server.restart();
		},
		transform: {
			order: 'pre',
			async handler(code, id) {
				if (!id.split('?', 1)[0]?.endsWith('.mdx')) return;
				this.addWatchFile(manifestFile);
				const result = await prepareDocsData(code, id, root);
				for (const item of result.modules) this.addWatchFile(item.file);
				return result.code === code ? undefined : { code: result.code, map: null };
			},
		},
	};
}
