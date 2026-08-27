import { expect, test } from 'vitest';
import type {
	ModuleGraphInterfaceArtifact,
	ModuleGraphInterfaceSharedDefinition,
} from '../../src/artifacts.ts';
import { linkBarrelComponents, moduleLinkResolutionKey } from '../../src/index.ts';

// A module's identity is its resolved path; a specifier is only the name one
// importer calls it by. When a page names a family through its folder barrel and
// another through a root barrel that re-exports that same folder barrel, both
// spellings rebase to one string, and the interface published under it has to
// carry both halves: the components the walk reached and the shared re-exports.

const sharedDefinition = (exportName: string): ModuleGraphInterfaceSharedDefinition =>
	({ exportName, definition: { id: `shared:${exportName}` }, graphBindings: [] }) as unknown as
		ModuleGraphInterfaceSharedDefinition;

const partsInterface = (filename: string, prefix: string): ModuleGraphInterfaceArtifact => ({
	passId: 'module-graph-interface',
	filename,
	exports: [],
	sharedDefinitions: [sharedDefinition(`${prefix}State`)],
	render: {
		version: 1,
		components: [
			{
				componentName: `${prefix}Root`,
				exportName: `${prefix}Root`,
				rootChunkId: 'chunk:0',
				childChunks: [],
			},
			{
				componentName: `${prefix}Label`,
				exportName: `${prefix}Label`,
				rootChunkId: 'chunk:1',
				childChunks: [],
			},
		],
	} as ModuleGraphInterfaceArtifact['render'],
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

// The folder barrel that reproduces the collapse: parts renamed, and the
// family's `shared()` definition re-exported beside them.
const familyBarrel = (family: string, prefix: string) =>
	barrelInterface(`/app/${family}/index.ts`, [
		{ exportName: 'label', source: `./${family}.tsrx`, importedName: `${prefix}Label` },
		{ exportName: 'root', source: `./${family}.tsrx`, importedName: `${prefix}Root` },
		{ exportName: 'state', source: `./${family}.tsrx`, importedName: `${prefix}State` },
	]);

const fixture: Record<string, ModuleGraphInterfaceArtifact> = {
	'/app/alpha/alpha.tsrx': partsInterface('/app/alpha/alpha.tsrx', 'Alpha'),
	'/app/beta/beta.tsrx': partsInterface('/app/beta/beta.tsrx', 'Beta'),
	'/app/alpha/index.ts': familyBarrel('alpha', 'Alpha'),
	'/app/beta/index.ts': familyBarrel('beta', 'Beta'),
	'/app/index.ts': barrelInterface('/app/index.ts', [
		{ exportName: 'alpha', source: './alpha/index.ts', importedName: '*' },
		{ exportName: 'beta', source: './beta/index.ts', importedName: '*' },
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

const joinResolve = (specifier: string, importer: string): string | null => {
	if (!specifier.startsWith('.')) return null;
	const joined = `/${normalize(`${directory(importer)}/${specifier}`.split('/')).join('/')}`;
	return fixture[joined] ? joined : null;
};

// The driver's path math, stated once: the specifier `parent` would write to
// import `target`, so a folder barrel reached two ways rebases to one string.
const relativeTo = (parent: string, target: string): string => {
	const from = normalize(directory(parent).split('/'));
	const to = normalize(target.split('/'));
	let shared = 0;
	while (shared < from.length && shared < to.length && from[shared] === to[shared]) shared += 1;
	const up = from.length - shared;
	const rest = to.slice(shared).join('/');
	return up === 0 ? `./${rest}` : `${'../'.repeat(up)}${rest}`;
};

function walkBarrels(parent: string, moduleImports: ReadonlyArray<string>) {
	const resolution: Record<string, string | null> = {};
	const read = new Map<string, ModuleGraphInterfaceArtifact | null>();
	const call = () =>
		linkBarrelComponents({
			parent,
			moduleImports: moduleImports.map((source) => ({ source })),
			resolution,
			moduleInterface: (filename) => read.get(filename),
			rebase: (target) => relativeTo(parent, target),
		});
	let artifact = call();
	for (let round = 0; artifact.pendingResolutions.length + artifact.pendingInterfaces.length; ) {
		expect(round).toBeLessThan(8);
		round += 1;
		for (const request of artifact.pendingResolutions)
			resolution[moduleLinkResolutionKey(request.specifier, request.parent)] = joinResolve(
				request.specifier,
				request.parent,
			);
		for (const filename of artifact.pendingInterfaces)
			read.set(filename, fixture[filename] ?? null);
		artifact = call();
	}
	return artifact;
}

const partPaths = (published: ModuleGraphInterfaceArtifact | undefined) =>
	(published?.linkedComponents ?? []).map((component) => component.exportPath.join('.')).sort();

const reexportNames = (published: ModuleGraphInterfaceArtifact | undefined) =>
	(published?.reexports ?? []).map((reexport) => reexport.exportName).sort();

test('the folder barrel named before the root barrel keeps its components and its shared re-export', () => {
	const artifact = walkBarrels('/app/alpha/scenarios/folder-first.tsrx', [
		'../index.ts',
		'../../index.ts',
	]);

	expect(artifact.diagnostics).toEqual([]);
	// One resolved module, `/app/alpha/index.ts`, reached under this one spelling
	// by both imports.
	const folder = artifact.interfaces['../index.ts'];
	expect(folder?.filename).toBe('/app/alpha/index.ts');
	expect(partPaths(folder)).toEqual(['label', 'root']);
	expect(reexportNames(folder)).toEqual(['state']);
	expect(partPaths(artifact.interfaces['../../index.ts'])).toEqual([
		'alpha.label',
		'alpha.root',
		'beta.label',
		'beta.root',
	]);
});

test('the root barrel named first leaves the folder barrel with both halves too', () => {
	const artifact = walkBarrels('/app/beta/scenarios/root-first.tsrx', [
		'../../index.ts',
		'../index.ts',
	]);

	expect(artifact.diagnostics).toEqual([]);
	const folder = artifact.interfaces['../index.ts'];
	expect(folder?.filename).toBe('/app/beta/index.ts');
	expect(partPaths(folder)).toEqual(['label', 'root']);
	expect(reexportNames(folder)).toEqual(['state']);
	expect(partPaths(artifact.interfaces['../../index.ts'])).toEqual([
		'alpha.label',
		'alpha.root',
		'beta.label',
		'beta.root',
	]);
});

test('a nested root-barrel re-export still steps into the folder barrel it republishes', () => {
	const artifact = walkBarrels('/app/alpha/scenarios/folder-first.tsrx', [
		'../index.ts',
		'../../index.ts',
	]);

	// The root barrel's shared surface is one segment that names the republished
	// folder barrel, and that republished entry is the merged one.
	expect(artifact.interfaces['../../index.ts']?.reexports).toEqual([
		{ exportName: 'alpha', importedName: '*', source: '../index.ts' },
		{ exportName: 'beta', importedName: '*', source: '../../beta/index.ts' },
	]);
	expect(artifact.interfaces['../../beta/index.ts']?.reexports).toEqual([
		{ exportName: 'state', importedName: 'BetaState', source: '../../beta/beta.tsrx' },
	]);
});

test('a page that names one barrel once publishes exactly what it published before', () => {
	const artifact = walkBarrels('/app/page.tsrx', ['./index.ts']);

	expect(artifact.diagnostics).toEqual([]);
	expect(Object.keys(artifact.interfaces).sort()).toEqual([
		'./alpha/alpha.tsrx',
		'./alpha/index.ts',
		'./beta/beta.tsrx',
		'./beta/index.ts',
		'./index.ts',
	]);
	// No key is written twice with differing content here, so the merge is a
	// no-op and the published shapes are byte-for-byte the ones the walk built.
	expect(artifact.interfaces['./index.ts']).toEqual({
		passId: 'module-graph-interface',
		filename: '/app/index.ts',
		exports: [],
		linkedComponents: [
			{
				exportPath: ['alpha', 'label'],
				source: './alpha/alpha.tsrx',
				importKind: 'named',
				importedName: 'AlphaLabel',
				componentName: 'AlphaLabel',
			},
			{
				exportPath: ['alpha', 'root'],
				source: './alpha/alpha.tsrx',
				importKind: 'named',
				importedName: 'AlphaRoot',
				componentName: 'AlphaRoot',
			},
			{
				exportPath: ['beta', 'label'],
				source: './beta/beta.tsrx',
				importKind: 'named',
				importedName: 'BetaLabel',
				componentName: 'BetaLabel',
			},
			{
				exportPath: ['beta', 'root'],
				source: './beta/beta.tsrx',
				importKind: 'named',
				importedName: 'BetaRoot',
				componentName: 'BetaRoot',
			},
		],
		reexports: [
			{ exportName: 'alpha', importedName: '*', source: './alpha/index.ts' },
			{ exportName: 'beta', importedName: '*', source: './beta/index.ts' },
		],
		render: { version: 1, components: [] },
	});
	// The `.tsrx` specifier still carries the real interface, untouched.
	expect(artifact.interfaces['./alpha/alpha.tsrx']).toBe(fixture['/app/alpha/alpha.tsrx']);
});
