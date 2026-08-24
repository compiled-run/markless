/**
 * A part written self-closed must be able to tell that it was given no children.
 *
 * The library carries a hand-written workaround for the opposite belief - that a
 * part cannot tell, so a fallback arm would render nothing for everybody - and
 * these rows are what that belief has to be checked against. Three records
 * decide the answer, all of them compile-time:
 *
 *   - the invocation edge says `children` is ABSENT when the tag is self-closed,
 *     and carries a `projection` only when the tag was written with content;
 *   - the guard resolves to a read of `prop:props.children`, so both render
 *     modes ask the same question of the same node;
 *   - the served module reads that node rather than re-deriving the answer.
 *
 * Absent, not empty-and-truthy: `packages/web/src/prerender/evaluator.ts` turns
 * an `absent` route into `undefined` and `renderSsrData` takes the `@else` arm
 * from it, so a childless part reaches its fallback in both modes.
 */
import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

const FAMILY = `
import { computed, shared, state } from '@markless/core';

export const barState = shared(() => {
	const bar = state({ amount: 40 });

	return { ...bar };
}, { scope: 'widget' });

export function Root({ children, ...rest }) @{
	const bar = barState();

	<div {...rest} class="root">{children}</div>
}

export function ValueLabel({ children, ...rest }) @{
	const bar = barState();
	const text = computed(() => String(bar.amount));

	<output {...rest} ui-value={text}>
		@if (children) { <span>{children}</span> } @else { <span>{text}</span> }
	</output>
}
`;

// Both placements sit in the family root's projection, which is where a consumer
// writes a part and the one arrangement the workaround note was written about.
const PAGE = `
import * as ui from './family.tsrx';

export default function Page() @{
	<main>
		<ui.Root>
			<ui.ValueLabel />
			<ui.ValueLabel>custom</ui.ValueLabel>
		</ui.Root>
	</main>
}
`;

async function compileFamilyAndPage() {
	const family = await compileTsrxModule({
		filename: '/workspace/src/family.tsrx',
		resolverId: 'virtual:resolver',
		symbols: [],
		source: FAMILY,
		importedModuleInterfaces: {},
	});
	const page = await compileTsrxModule({
		filename: '/workspace/src/Page.tsrx',
		resolverId: 'virtual:resolver',
		symbols: [],
		source: PAGE,
		importedModuleInterfaces: { './family.tsrx': family.moduleGraphInterface },
	});
	return { family, page };
}

function edgesOf(result: Awaited<ReturnType<typeof compileFamilyAndPage>>['page'], name: string) {
	return (
		result.publicRenderModule.componentDefinitions.find(
			(definition) => definition.name === name,
		)?.edges ?? []
	);
}

test('a self-closed part is passed no children, and a written-into one is', async () => {
	const { page } = await compileFamilyAndPage();
	const [, selfClosed, withChildren] = edgesOf(page, 'Page');

	expect(selfClosed?.childComponentName).toBe('ValueLabel');
	expect(selfClosed?.props).toEqual(
		expect.arrayContaining([{ name: 'children', kind: 'absent' }]),
	);
	// Absence is the whole answer: an edge that also carried a projection would
	// hand the part something to render and its guard could never say "childless".
	expect(selfClosed).not.toHaveProperty('projection');

	expect(withChildren?.childComponentName).toBe('ValueLabel');
	expect(withChildren?.projection).toMatchObject({ kind: 'static-markup', markup: 'custom' });
});

test('the guard asks the props node for children, so both render modes ask the same question', async () => {
	const { family } = await compileFamilyAndPage();
	const [branch] = (
		family.publicRenderModule.componentDefinitions.find(
			(definition) => definition.name === 'ValueLabel',
		)?.branches ?? []
	);

	expect(branch?.testSource).toBe('children');
	expect(branch?.testReads).toEqual([{ graphNodeId: 'prop:props', path: ['children'] }]);
});

test('the served module decides the arm by reading that node', async () => {
	const { family } = await compileFamilyAndPage();
	const ssr = family.publicRenderModule.ssrModuleSource;

	expect(ssr).toContain('marklessSsrRenderStateValues.get("prop:props"),["children"]');
});

test('the page module hands the self-closed placement no children prop', async () => {
	const { page } = await compileFamilyAndPage();
	const ssr = page.publicRenderModule.ssrModuleSource;
	const selfClosed = /case "component-edge:1":\{[\s\S]*?const childProps=(\{[^}]*\})/.exec(ssr);

	expect(selfClosed?.[1]).toBe('{}');
	expect(ssr).toContain('const childProps={children:marklessSsrDataContext.projectionHtml}');
});
