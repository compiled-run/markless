// Compiles one synthetic app per @markless/ui family (its root holding every other part it exports) for native and prints
// what the build refuses, as JSON: `node packages/mobile/proofs/ui-family-probe.ts`. The usage is synthetic, so a refusal
// here names a missing capability of the native path, not proof that a real app of that family fails or passes.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { buildSemanticGraph } from '@markless/compiler';
import { compileNativeComponent } from '../src/compile.ts';
import { readWorkspaceModule } from '../src/harness/rung.ts';

const repoRoot = resolve(import.meta.dirname, '..', '..', '..');
const families = join(repoRoot, 'packages/headless/components/src');
const namespace = (folder: string) => folder.replace('-', '');
const report: Record<
	string,
	{ readonly payload: boolean; readonly diagnostics: readonly string[] }
> = {};
for (const folder of readdirSync(families, { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.map((entry) => entry.name)
	.sort()) {
	const index = join(families, folder, 'index.ts');
	if (!existsSync(index)) continue;
	const graph = await buildSemanticGraph({
		filename: relative(repoRoot, index),
		source: readFileSync(index, 'utf8'),
	});
	const parts = (graph.moduleGraphInterface.reexports ?? [])
		.map((entry) => entry.exportName)
		.filter(
			(name) =>
				name !== 'state' && !name.endsWith('State') && name[0] === name[0]!.toLowerCase(),
		);
	const name = namespace(folder);
	const inner = parts
		.filter((part) => part !== 'root')
		.map((part) => `<${name}.${part}>x</${name}.${part}>`)
		.join('');
	const body = parts.includes('root') ? `<${name}.root>${inner}</${name}.root>` : inner;
	const build = await compileNativeComponent({
		filename: `packages/mobile/proofs/probe-${folder}.tsrx`,
		source: `import { ${name} } from '@markless/ui';\nexport default function App() @{\n<main>${body}</main>\n}\n`,
		readModule: readWorkspaceModule,
	});
	report[folder] = {
		payload: build.payload !== null,
		diagnostics: [
			...new Set(
				build.diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`),
			),
		],
	};
}
console.log(JSON.stringify(report, null, '\t'));
