import { expect, test } from 'vitest';
import { PropFlowRegistry, type ModulePropFlow } from '../src/prop-flow.ts';

const caption = '/app/components/caption.tsrx';
const gloss = '/app/components/gloss.tsrx';
const icon = '/app/components/icon.tsrx';

// Caption renders Gloss only in its @if (word) arm, and Icon outside any branch.
const captionFlow: ModulePropFlow = {
	components: [{ name: 'Caption', exportName: 'default' }],
	decided: [],
	edges: [
		{
			id: 'component-edge:0',
			parentComponentName: 'Caption',
			childComponentName: 'Gloss',
			importSource: './gloss.tsrx',
			props: { word: { kind: 'forwarded', props: ['word'], source: 'word' } },
			childCount: 0,
			branchArms: [{ branchSiteId: 'branch-site:0', arm: 0 }],
		},
		{
			id: 'component-edge:1',
			parentComponentName: 'Caption',
			childComponentName: 'Icon',
			importSource: './icon.tsrx',
			props: {},
			childCount: 0,
		},
	],
	branches: [
		{
			id: 'branch-site:0',
			componentName: 'Caption',
			kind: 'if',
			armCount: 2,
			propTest: { kind: 'prop', path: ['word'] },
		},
	],
};

function page(props: ModulePropFlow['edges'][number]['props']): ModulePropFlow {
	return {
		components: [{ name: 'Page', exportName: 'default' }],
		decided: [],
		edges: [
			{
				id: 'component-edge:0',
				parentComponentName: 'Page',
				childComponentName: 'Caption',
				importSource: '../components/caption.tsrx',
				props,
				childCount: 0,
			},
		],
	};
}

function registry(pages: Record<string, ModulePropFlow>) {
	const flows = new PropFlowRegistry();
	flows.record(
		caption,
		captionFlow,
		new Map([
			['component-edge:0', gloss],
			['component-edge:1', icon],
		]),
	);
	for (const [file, flow] of Object.entries(pages))
		flows.record(file, flow, new Map([['component-edge:0', caption]]));
	return flows;
}

const textOnly = page({ text: { kind: 'fixed', value: { value: 'plain' } } });
const withWord = page({ word: { kind: 'fixed', value: { value: 'state' } } });

function unreachable(
	flows: PropFlowRegistry,
	files: string[],
	{ roots = files.filter((file) => file.includes('/pages/')), importers = {} } = {} as {
		roots?: string[];
		importers?: Record<string, string[]>;
	},
) {
	const result = flows.unreachableChildren(
		new Set([caption, gloss, icon, ...files]),
		new Set(roots),
		new Map(Object.entries(importers).map(([file, from]) => [file, new Set(from)])),
	);
	return Object.fromEntries([...result].map(([file, children]) => [file, [...children]]));
}

test('a route whose every Caption caller passes only text never reaches Gloss, and still reaches Icon', () => {
	const flows = registry({ '/app/pages/a.tsrx': textOnly, '/app/pages/b.tsrx': textOnly });
	expect(unreachable(flows, ['/app/pages/a.tsrx', '/app/pages/b.tsrx'])).toEqual({
		[caption]: [gloss],
	});
});

test('one caller on the route that passes the word keeps Gloss', () => {
	const flows = registry({ '/app/pages/a.tsrx': textOnly, '/app/pages/b.tsrx': withWord });
	expect(unreachable(flows, ['/app/pages/a.tsrx', '/app/pages/b.tsrx'])).toEqual({});
	// A caller on another route does not count.
	expect(unreachable(flows, ['/app/pages/a.tsrx'])).toEqual({ [caption]: [gloss] });
});

test.each([
	['state', { kind: 'changing', source: 'shown' }],
	['a value the build cannot see', { kind: 'unknown', source: 'pick()' }],
	['a fixed callback with no value', { kind: 'fixed' }],
] as const)('a caller passing the word %s keeps Gloss', (_, word) => {
	const flows = registry({ '/app/pages/a.tsrx': page({ word }) });
	expect(unreachable(flows, ['/app/pages/a.tsrx'])).toEqual({});
});

test('a caller spreading props keeps Gloss', () => {
	const flows = registry({
		'/app/pages/a.tsrx': {
			...textOnly,
			edges: [{ ...textOnly.edges[0]!, spread: { kind: 'changing', source: 'rest' } }],
		},
	});
	expect(unreachable(flows, ['/app/pages/a.tsrx'])).toEqual({});
});

test('Caption keeps every arm when a file the registry has no record of imports it', () => {
	const flows = registry({ '/app/pages/a.tsrx': textOnly });
	expect(
		unreachable(flows, ['/app/pages/a.tsrx', '/app/lib/barrel.ts'], {
			importers: { [caption]: ['/app/pages/a.tsrx', '/app/lib/barrel.ts'] },
		}),
	).toEqual({});
	expect(
		unreachable(flows, ['/app/pages/a.tsrx'], {
			importers: { [caption]: ['/app/pages/a.tsrx'] },
		}),
	).toEqual({ [caption]: [gloss] });
});

test('Caption keeps every arm with no recorded caller on the route, or as a route root itself', () => {
	const flows = registry({});
	expect(unreachable(flows, [])).toEqual({});
	const called = registry({ '/app/pages/a.tsrx': textOnly });
	expect(unreachable(called, ['/app/pages/a.tsrx'], { roots: [caption] })).toEqual({});
});

test('an MDX page recorded with its literal props decides the arm as a TSRX caller does', () => {
	const flows = registry({});
	flows.recordLiteralInstances('/app/pages/notes.mdx', [
		{ childSource: caption, props: { text: 'plain' } },
	]);
	expect(unreachable(flows, ['/app/pages/notes.mdx'])).toEqual({ [caption]: [gloss] });
	flows.recordLiteralInstances('/app/pages/notes.mdx', [
		{ childSource: caption, props: { text: 'plain', word: 'state' } },
	]);
	expect(unreachable(flows, ['/app/pages/notes.mdx'])).toEqual({});
	// A literal caller passes nothing that changes, so no prop-decided refusal names it.
	expect(flows.refusals()).toEqual([]);
});
