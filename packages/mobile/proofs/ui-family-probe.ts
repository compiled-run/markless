// Compiles one synthetic app per @markless/ui family (its root holding every other part it exports) for native and prints
// what the build refuses, as JSON: `node packages/mobile/proofs/ui-family-probe.ts`. The usage is synthetic, so a refusal
// there names a missing capability of the native path, not proof that a real app of that family fails or passes; `scenario`
// is the family's own scenarios/basic.tsrx, used by an app as the family's tests use it.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { buildSemanticGraph } from '@markless/compiler';
import { compileNativeComponent } from '../src/compile.ts';
import { readWorkspaceModule } from '../src/harness/rung.ts';

const repoRoot = resolve(import.meta.dirname, '..', '..', '..');
const families = join(repoRoot, 'packages/headless/components/src');
const namespace = (folder: string) => folder.replace('-', '');
type Measure = { readonly payload: boolean; readonly diagnostics: readonly string[] };
const report: Record<string, Measure & { readonly scenario?: Measure }> = {};
const measure = (build: Awaited<ReturnType<typeof compileNativeComponent>>): Measure => ({
	payload: build.payload !== null,
	diagnostics: [
		...new Set(build.diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)),
	],
});
const probeDir = 'packages/mobile/proofs';
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
	// A part is a re-export the source module's analysis lists as a component; state helpers and functions are not rendered.
	const exportedComponents = new Map<string, Set<string>>();
	const parts: string[] = [];
	for (const entry of graph.moduleGraphInterface.reexports ?? []) {
		const source = join(families, folder, entry.source);
		if (!exportedComponents.has(source)) {
			const sourceGraph = await buildSemanticGraph({
				filename: relative(repoRoot, source),
				source: readFileSync(source, 'utf8'),
			});
			exportedComponents.set(
				source,
				new Set(sourceGraph.components.flatMap((component) => component.exportName ?? [])),
			);
		}
		if (exportedComponents.get(source)!.has(entry.importedName)) parts.push(entry.exportName);
	}
	const name = namespace(folder);
	// A part shown on a device object takes that object as `el` and no children, as its props say; the rest wrap text.
	const usesCamera = parts.includes('camera');
	const inner = parts
		.filter((part) => part !== 'root')
		.map((part) =>
			part === 'camera' ? `<${name}.camera el={cam} />` : `<${name}.${part}>x</${name}.${part}>`,
		)
		.join('');
	const body = parts.includes('root') ? `<${name}.root>${inner}</${name}.root>` : inner;
	const build = await compileNativeComponent({
		filename: `${probeDir}/probe-${folder}.tsrx`,
		source: usesCamera
			? `import { ${name} } from '@markless/ui';\nimport { camera } from '@markless/device';\nexport default function App() @{\nconst cam = camera();\n<main>${body}</main>\n}\n`
			: `import { ${name} } from '@markless/ui';\nexport default function App() @{\n<main>${body}</main>\n}\n`,
		readModule: readWorkspaceModule,
		// An app that shows a camera says why it asks for one, as an app's config does.
		...(usesCamera ? { device: { usage: { camera: 'The probe shows a camera.' } } } : {}),
	});
	const basic = join(families, folder, 'scenarios', 'basic.tsrx');
	// The scenario's component, by the name the module's analysis exports it under.
	const exported = existsSync(basic)
		? (
				await buildSemanticGraph({ filename: relative(repoRoot, basic), source: readFileSync(basic, 'utf8') })
			).components.find((component) => component.exportName)?.exportName
		: undefined;
	const from = `./${relative(join(repoRoot, probeDir), basic)}`;
	const scenario = exported
		? measure(
				await compileNativeComponent({
					filename: `${probeDir}/probe-${folder}-scenario.tsrx`,
					source: `${exported === 'default' ? `import Scenario from '${from}';` : `import { ${exported} as Scenario } from '${from}';`}\nexport default function App() @{\n<Scenario />\n}\n`,
					readModule: readWorkspaceModule,
				}),
			)
		: undefined;
	report[folder] = { ...measure(build), ...(scenario ? { scenario } : {}) };
}
console.log(JSON.stringify(report, null, '\t'));
