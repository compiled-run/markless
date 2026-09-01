import { expect, test } from 'vitest';
import {
	composeMdxView,
	renderMdxChild,
	type MdxChild,
} from '../../router/src/vite/runtime/mdx-route.ts';
import { protocolIslandSegment } from '../../serializer/src/protocol-constants.ts';

const ROSTER = 'shared:src/rows.tsrx#rowsState/element:rowEls';

type RosterRenderContext = {
	readonly rosterCount?: (roster: string) => string;
};

// A roster-reading component: it prints how many members it is about to emit,
// which server render can only answer as a placeholder because the members
// render after the count does.
function rowsIsland(members: number) {
	return {
		renderSsr(_props?: unknown, renderContext?: unknown) {
			const count = (renderContext as RosterRenderContext | undefined)?.rosterCount;
			if (!count) throw new Error('MARKLESS_SSR_ROSTER_COUNT_UNANSWERED: computed:total');
			return {
				html: `<ul ui-max="${count(ROSTER)}">${'<li></li>'.repeat(members)}</ul>`,
				view: {
					version: 1,
					locators: Array.from({ length: members }, (_one, index) => ({
						hostNodeId: `h${index}`,
						index,
					})),
					elementHandles: Array.from({ length: members }, (_one, index) => ({
						hostNodeId: `h${index}`,
						handleId: ROSTER,
						name: 'rowEls',
						plural: true,
					})),
				},
			};
		},
	};
}

async function renderIslands(memberCounts: ReadonlyArray<number>) {
	// The loader a page's own resume module installs; renderMdxChild answers its
	// counts through it, so a test standing in for a served page has to install it.
	(globalThis as { __marklessRosterResume?: unknown }).__marklessRosterResume ??= () =>
		import('../src/fns/roster-resume.ts');
	const children: MdxChild[] = [];
	const html: string[] = [];
	for (const [index, members] of memberCounts.entries()) {
		html.push(
			await renderMdxChild(children, rowsIsland(members), {}, {
				componentIndex: index,
				hostPrefix: protocolIslandSegment(index),
				symbolPrefix: protocolIslandSegment(index),
			}),
		);
	}
	return { html, children };
}

// The gap this pins: composing two islands used to establish no roster render
// context at all, so the count read threw instead of answering.
test('each island of a composed page answers its own roster count', async () => {
	const { html } = await renderIslands([2, 3]);

	expect(html[0]).toContain('ui-max="2"');
	expect(html[1]).toContain('ui-max="3"');
});

// Counts are keyed by the roster's registration id, which is identical in both
// islands until composition prefixes the handles. Answering page-wide would
// tally every island's members into one number.
test('a composed island count is not pooled with the other island', async () => {
	const { html } = await renderIslands([2, 3]);

	expect(html.join('')).not.toContain('ui-max="5"');
});

// The other half of the same fact: once composition has run, each island's
// members are filed under its own segment, so the merged view still separates
// rosters that spell one id.
test('composition files each island roster under its own segment', async () => {
	const { children } = await renderIslands([2, 3]);
	const view = composeMdxView(
		children.map((child) => ({ kind: 'component', componentIndex: child.componentIndex }) as const),
		children,
		0,
	);

	const hostsOf = (index: number) =>
		(view?.elementHandles ?? []).filter((handle) =>
			handle.hostNodeId.startsWith(protocolIslandSegment(index)),
		);
	expect(hostsOf(0)).toHaveLength(2);
	expect(hostsOf(1)).toHaveLength(3);
});
