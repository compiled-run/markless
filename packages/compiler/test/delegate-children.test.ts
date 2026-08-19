import { expect, test } from 'vitest';
import type { ArtifactChildMaterialization, LinkedArtifactChild } from '../src/artifacts.ts';
import { linkCompilerPasses } from '../src/pass-registry.ts';
import {
	DELEGATE_CHILDREN_PASS_ID,
	delegateChildMaterializable,
	delegateChildRenderPlan,
	delegateChildRendering,
	delegateChildResolutionRequests,
	delegateMaterializationScope,
	linkDelegateChildren,
	planDelegateChildren,
} from '../src/passes/link/delegate-children.ts';

const candidate = (
	edgeId: string,
	importSource: string,
	overrides: Partial<LinkedArtifactChild> = {},
): LinkedArtifactChild => ({
	edgeId,
	componentName: 'StaticFrame',
	importSource,
	importKind: 'named',
	hasChildren: false,
	props: [],
	...overrides,
});

const rendering = (html: string): ArtifactChildMaterialization => ({ html, elementCount: 1 });

test('delegate-children is registered as a link pass with its artifact boundary', () => {
	expect(linkCompilerPasses).toContainEqual({
		passId: 'delegate-children',
		description: expect.stringContaining('delegates'),
		consumes: ['linkedModuleGraph', 'delegateRenderings'],
		produces: ['delegateChildren'],
	});
});

test('a node_modules child with an external-delegate artifact is materializable', () => {
	const child = candidate('edge-1', '@acme/frame');
	const children = planDelegateChildren(
		[child],
		{ 'edge-1': '/workspace/app/node_modules/@acme/frame/dist/index.js' },
	);
	expect(children[0]).toMatchObject({ kind: 'external-delegate', loadable: true });

	const artifact = linkDelegateChildren({
		children,
		renderings: { 'edge-1': rendering('<aside data-package-frame>Package</aside>') },
	});
	expect(delegateChildMaterializable(children[0]!, artifact.materializations)).toBe(true);
	expect(artifact.materializations['edge-1']?.html).toBe(
		'<aside data-package-frame>Package</aside>',
	);
	expect(artifact.diagnostics).toEqual([]);
});

test('a compiled-TSRX child is never materializable, whatever the linker loaded for it', () => {
	const specifierChild = planDelegateChildren([candidate('edge-1', './Child.tsrx')], {})[0]!;
	expect(specifierChild.kind).toBe('compiled-tsrx');
	expect(specifierChild.loadable).toBe(false);

	const resolvedChild = planDelegateChildren([candidate('edge-2', '#child')], {
		'edge-2': '/workspace/app/components/Child.tsrx',
	})[0]!;
	expect(resolvedChild.kind).toBe('compiled-tsrx');

	const renderings = {
		'edge-1': rendering('<b>tsrx</b>'),
		'edge-2': rendering('<b>tsrx</b>'),
	};
	expect(delegateChildMaterializable(specifierChild, renderings)).toBe(false);
	expect(delegateChildMaterializable(resolvedChild, renderings)).toBe(false);
	expect(
		linkDelegateChildren({ children: [specifierChild, resolvedChild], renderings })
			.materializations,
	).toEqual({});
});

test('a TSRX specifier never costs the linker a resolution', () => {
	expect(
		delegateChildResolutionRequests([
			candidate('edge-1', './Child.tsrx'),
			candidate('edge-2', '@acme/frame'),
		]).map((request) => request.edgeId),
	).toEqual(['edge-2']);
});

test('an external-delegate child with no delegate artifact reports, it does not throw', () => {
	const children = planDelegateChildren([candidate('edge-1', '@acme/frame')], {
		'edge-1': '/workspace/app/node_modules/@acme/frame/dist/index.js',
	});
	const artifact = linkDelegateChildren({ children, renderings: {} });
	expect(artifact.materializations).toEqual({});
	expect(artifact.diagnostics).toHaveLength(1);
	expect(artifact.diagnostics[0]).toMatchObject({
		code: 'MARKLESS_DELEGATE_ARTIFACT_MISSING',
		passId: DELEGATE_CHILDREN_PASS_ID,
		artifactKeys: ['delegateChildren'],
		source: '/workspace/app/node_modules/@acme/frame/dist/index.js',
	});
});

test('a dependency TypeScript source is a delegate, an unresolved specifier is not', () => {
	expect(
		planDelegateChildren([candidate('edge-1', '@markless/core')], {
			'edge-1': '/workspace/packages/core/src/router.ts',
		})[0],
	).toMatchObject({ kind: 'external-delegate', loadable: true });
	expect(planDelegateChildren([candidate('edge-2', '@acme/missing')], {})[0]).toMatchObject({
		kind: 'unresolved',
		loadable: false,
	});
	expect(
		linkDelegateChildren({
			children: planDelegateChildren([candidate('edge-2', '@acme/missing')], {}),
			renderings: {},
		}).diagnostics,
	).toEqual([]);
});

test('only a client page root or a reached render-data module materializes delegates', () => {
	const scope = (overrides: Parameters<typeof delegateMaterializationScope>[0]) =>
		delegateMaterializationScope(overrides);
	expect(
		scope({
			clientEnvironment: true,
			symbolOnlyRequest: false,
			moduleEntry: true,
			renderDataReached: false,
		}),
	).toBe(true);
	expect(
		scope({
			clientEnvironment: true,
			symbolOnlyRequest: true,
			moduleEntry: true,
			renderDataReached: false,
		}),
	).toBe(false);
	expect(
		scope({
			clientEnvironment: true,
			symbolOnlyRequest: false,
			moduleEntry: false,
			renderDataReached: false,
		}),
	).toBe(false);
	expect(
		scope({
			clientEnvironment: false,
			symbolOnlyRequest: false,
			moduleEntry: true,
			renderDataReached: false,
		}),
	).toBe(false);
	expect(
		scope({
			clientEnvironment: false,
			symbolOnlyRequest: false,
			moduleEntry: false,
			renderDataReached: true,
		}),
	).toBe(true);
});

test('a prop the compiler cannot read at build time refuses instead of deferring', () => {
	const plan = delegateChildRenderPlan(
		candidate('edge-1', '@acme/frame', {
			props: [{ name: 'onSelect', kind: 'runtime' }],
		}),
	);
	expect(plan.ok).toBe(false);
	expect(plan.ok === false && plan.diagnostic).toMatchObject({
		code: 'MARKLESS_ARTIFACT_CHILD_PROP_NOT_BUILD_KNOWN',
		severity: 'error',
		passId: DELEGATE_CHILDREN_PASS_ID,
	});
	expect(plan.ok === false && plan.diagnostic.message).toContain('prop "onSelect"');
});

test('unprojected children are as unreadable at build time as a runtime prop', () => {
	const plan = delegateChildRenderPlan(
		candidate('edge-1', '@acme/frame', { hasChildren: true }),
	);
	expect(plan.ok === false && plan.diagnostic.message).toContain('prop "children"');
});

test('build-known props and a static projection become the render props', () => {
	const plan = delegateChildRenderPlan(
		candidate('edge-1', '@acme/frame', {
			props: [{ name: 'label', kind: 'serializable', value: 'Ready' }],
			hasChildren: true,
			projection: { kind: 'static-markup', markup: '<b>Hi</b>', elementCount: 1 },
		}),
	);
	expect(plan).toEqual({ ok: true, props: { label: 'Ready', children: '<b>Hi</b>' } });
});

test('a delegate output without static HTML is a refusal, and a full output keeps its payloads', () => {
	const child = candidate('edge-1', '@acme/frame');
	expect(delegateChildRendering(child, { elementCount: 2 })).toMatchObject({
		ok: false,
		diagnostic: {
			code: 'MARKLESS_ARTIFACT_CHILD_RENDER_INVALID',
			passId: DELEGATE_CHILDREN_PASS_ID,
		},
	});
	expect(delegateChildRendering(child, undefined)).toMatchObject({ ok: false });
	expect(
		delegateChildRendering(child, {
			html: '<i>x</i>',
			state: { records: [] },
			structureTokens: [{ token: 1 }],
			ignored: 'dropped',
		}),
	).toEqual({
		ok: true,
		rendering: {
			html: '<i>x</i>',
			elementCount: 0,
			state: { records: [] },
			structureTokens: [{ token: 1 }],
		},
	});
});
