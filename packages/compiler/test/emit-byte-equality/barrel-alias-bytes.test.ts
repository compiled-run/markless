import { expect, test } from 'vitest';
import type { ModuleGraphInterfaceArtifact } from '../../src/artifacts.ts';
import { compileTsrxModule, linkBarrelComponents, moduleLinkResolutionKey } from '../../src/index.ts';

// Reaching one module under one specifier twice costs a page nothing. The barrel
// walk now merges a key it has already published instead of overwriting it, so
// the interface a page is handed — and every byte compiled from it — has to be
// the same whether the walk arrived once or twice.

const family = `
import { shared, state } from '@markless/core';

export const famState = shared(
	() => {
		const tones = state({ tone: 'plain' });
		return { ...tones, mark() { tones.tone = 'marked'; } };
	},
	{ scope: 'widget' },
);

export function FamRoot({ children }) @{
	const fam = famState();
	<div data-fam-root data-fam-tone={fam.tone}>{children}</div>
}

export function FamLabel({ children }) @{
	<span data-fam-label>{children}</span>
}
`;

const page = `
import * as fam from '../index.ts';

export default function Page() @{
	<main>
		<fam.root>
			<fam.label>one</fam.label>
		</fam.root>
	</main>
}
`;

const compiledFamily = await compileTsrxModule({
	filename: '/app/fam/fam.tsrx',
	source: family,
	symbols: [],
});

const barrelInterface = (
	filename: string,
	reexports: ReadonlyArray<{ exportName: string; source: string; importedName: string }>,
): ModuleGraphInterfaceArtifact => ({
	passId: 'module-graph-interface',
	filename,
	exports: [],
	reexports,
	render: { version: 1, components: [] },
});

const fixture: Record<string, ModuleGraphInterfaceArtifact> = {
	'/app/fam/fam.tsrx': compiledFamily.moduleGraphInterface,
	'/app/fam/index.ts': barrelInterface('/app/fam/index.ts', [
		{ exportName: 'label', source: './fam.tsrx', importedName: 'FamLabel' },
		{ exportName: 'root', source: './fam.tsrx', importedName: 'FamRoot' },
		{ exportName: 'state', source: './fam.tsrx', importedName: 'famState' },
	]),
	'/app/index.ts': barrelInterface('/app/index.ts', [
		{ exportName: 'fam', source: './fam/index.ts', importedName: '*' },
	]),
};

function normalize(segments: ReadonlyArray<string>): string[] {
	const out: string[] = [];
	for (const segment of segments) {
		if (segment === '' || segment === '.') continue;
		if (segment === '..') out.pop();
		else out.push(segment);
	}
	return out;
}

const directory = (filename: string) => filename.slice(0, filename.lastIndexOf('/'));

const resolve = (specifier: string, importer: string): string | null => {
	if (!specifier.startsWith('.')) return null;
	const joined = `/${normalize(`${directory(importer)}/${specifier}`.split('/')).join('/')}`;
	return fixture[joined] ? joined : null;
};

const relativeTo = (parent: string, target: string): string => {
	const from = normalize(directory(parent).split('/'));
	const to = normalize(target.split('/'));
	let shared = 0;
	while (shared < from.length && shared < to.length && from[shared] === to[shared]) shared += 1;
	const up = from.length - shared;
	const rest = to.slice(shared).join('/');
	return up === 0 ? `./${rest}` : `${'../'.repeat(up)}${rest}`;
};

const PARENT = '/app/fam/scenarios/page.tsrx';

function walkBarrels(moduleImports: ReadonlyArray<string>) {
	const resolution: Record<string, string | null> = {};
	const read = new Map<string, ModuleGraphInterfaceArtifact | null>();
	const call = () =>
		linkBarrelComponents({
			parent: PARENT,
			moduleImports: moduleImports.map((source) => ({ source })),
			resolution,
			moduleInterface: (filename) => read.get(filename),
			rebase: (target) => relativeTo(PARENT, target),
		});
	let artifact = call();
	for (let round = 0; artifact.pendingResolutions.length + artifact.pendingInterfaces.length; ) {
		expect(round).toBeLessThan(8);
		round += 1;
		for (const request of artifact.pendingResolutions)
			resolution[moduleLinkResolutionKey(request.specifier, request.parent)] = resolve(
				request.specifier,
				request.parent,
			);
		for (const filename of artifact.pendingInterfaces)
			read.set(filename, fixture[filename] ?? null);
		artifact = call();
	}
	return artifact;
}

const emitted = async (interfaces: Record<string, ModuleGraphInterfaceArtifact>) => {
	const result = await compileTsrxModule({
		filename: PARENT,
		source: page,
		symbols: [],
		importedModuleInterfaces: interfaces,
	});
	expect(result.semanticGraph.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
	return {
		renderDataModuleSource: result.publicRenderModule.renderDataModuleSource,
		ssrModuleSource: result.publicRenderModule.ssrModuleSource,
		publicRenderPlan: JSON.stringify(result.publicRenderPlan, null, 2),
		protocolState: JSON.stringify(result.protocolState, null, 2),
		protocolView: JSON.stringify(result.protocolView, null, 2),
	};
};

const single = walkBarrels(['../index.ts']);
const doubled = walkBarrels(['../index.ts', '../../index.ts']);

test('the folder barrel a page names twice publishes what naming it once published', () => {
	// The root barrel adds its own key; the shared key must be untouched by it.
	expect(doubled.interfaces['../index.ts']).toEqual(single.interfaces['../index.ts']);
	expect(doubled.interfaces['../fam.tsrx']).toBe(single.interfaces['../fam.tsrx']);
});

test('a single-alias page emits the same bytes with and without the second reach', async () => {
	expect(await emitted(doubled.interfaces)).toEqual(await emitted(single.interfaces));
});
