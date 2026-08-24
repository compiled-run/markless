import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, readUntil, type Conveys } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Nested from './scenarios/nested.tsrx';

// What a screen reader says about the tree family. Each step names the facts the
// announcement has to convey - role, accessible name, state - and never a
// product's wording, so the same expectations run against NVDA and VoiceOver
// once those drivers land. `sr` is the only line that picks a reader.
//
// aria-at coverage, recorded honestly: there is NONE. No treeview plan and no
// treegrid plan among the 40 test-plan folders under w3c/aria-at/tests/apg
// (read 2026-08-23, listed in full in research-otp.md §4). The nearest
// neighbours are the disclosure plans, which cover one aria-expanded button and
// its panel - one node of a tree, with no level, no set position and no roving
// tab stop. So every sequence below is DERIVED from the WAI-ARIA tree semantics
// and is ours, not a community-vetted assertion set.
//
// Two of those facts have no slot in the shared reader vocabulary - the tree and
// treeitem roles, and the level - so the rows that need them assert on the
// captured phrase instead of on a vocabulary word, and say so at each site.
// Every expectation here was captured from this reader's own output against
// these scenarios before it was written down, not predicted from the markup.
//
// The sequences are grouped into three rows rather than one row each, and that
// is a measurement, not a preference: this lane runs its files in parallel, and
// a seven-row version of this file pushed three OTHER families' gesture rows
// (pagination, tabs, collapsible) past their poll ceiling. Three rows leave the
// lane green..
const sr = virtualDriver;

let mounted: HTMLElement | undefined;

async function open(component: Parameters<typeof render>[0]) {
	const { container } = await render(component);
	mounted = container as unknown as HTMLElement;
	await sr.start(mounted);
}

afterEach(async () => {
	await sr.stop().catch(() => {});
});

function expectConveys(phrase: string, conveys: Conveys) {
	expect(missingFacts(sr, phrase, conveys), `${sr.name} announced "${phrase}"`).toEqual([]);
}

// Sequences A, E and F, read in one walk down a closed tree.
test('reading a closed tree conveys the container, the closed parent and the end node', async () => {
	await open(Nested);

	// A: the container's role and its name are what tell a person what they are
	// inside. `tree` has no vocabulary slot, so the role word is asserted on the
	// phrase. The name comes from the consumer's `aria-label`, because a tree
	// cannot be named by its own label part.
	const container = await readUntil(sr, { name: 'Project files' });
	expect(container, `${sr.name} announced "${container}"`).toContain('tree');

	// A, and the row QDS fails: with `aria-expanded` omitted while closed, a
	// reader announces a folder as an end node and there is no signal that
	// anything can be opened.
	const parent = await readUntil(sr, { name: 'src', state: ['notExpanded'] });
	expectConveys(parent, { name: 'src', state: ['notExpanded'] });
	expect(parent, `${sr.name} announced "${parent}"`).toContain('treeitem');
	expect(parent, `${sr.name} announced "${parent}"`).toContain('level 1');

	// The control that opens the node is announced with that node's name, through
	// a minted id nobody spelled. QDS points its trigger at an id that only
	// exists if the label part was mounted; ours is a handle the compiler
	// resolves, and this is what a reader makes of it.
	expectConveys(await readUntil(sr, { role: 'button' }), { role: 'button', name: 'src' });

	// F: an end node carries no open state at all, so a person can tell it apart
	// from a folder nobody has opened - and no selection state either, because a
	// disclosure tree does not select. QDS writes aria-selected="false" on every
	// node of a tree that cannot select.
	const leaf = await readUntil(sr, { name: 'README.md' });
	expect(leaf, `${sr.name} announced "${leaf}"`).toContain('treeitem');
	expect(leaf, `${sr.name} announced "${leaf}"`).toContain('level 1');
	expect(leaf).not.toContain('expanded');
	expect(leaf).not.toContain('selected');

	// E: the children of the closed folder were never on the screen, so the walk
	// that just reached the end node passed over them rather than through them.
	const spoken = (await sr.spokenPhraseLog()).join(' | ');
	expect(spoken).not.toContain('index.ts');
	expect(spoken).not.toContain('app.tsrx');
});

// Sequences B and C. B: the first ArrowRight opens the node and does not move.
// C: the second descends, and the level change is the whole point - a tree whose
// aria-level does not increment announces a flat list, which is the single most
// common tree defect.
test('opening a node announces it as expanded, and descending announces the next level', async () => {
	const { container } = await render(Nested);
	mounted = container as unknown as HTMLElement;
	const row = mounted.querySelector('[data-testid="src-item"]') as HTMLElement;
	// The gesture runs BEFORE the reader starts, and the wait for it is a plain
	// loop rather than a 1s poll: this lane runs its files in parallel, and a
	// gesture that has to land inside a poll ceiling is exactly the row that goes
	// red under that load. What this row asserts is the announcement, not how
	// fast the dispatch was; ArrowRight's own two phases are asserted in the
	// browser suite.
	(mounted.querySelector('[data-testid="src-itemtrigger"]') as HTMLElement | null)?.click();
	for (let wait = 0; wait < 40 && row.getAttribute('aria-expanded') !== 'true'; wait++) {
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	expect(row.getAttribute('aria-expanded')).toBe('true');
	await sr.start(mounted);

	const opened = await readUntil(sr, { state: ['expanded'] }, 24);
	expectConveys(opened, { state: ['expanded'] });
	expect(opened, `${sr.name} announced "${opened}"`).toContain('treeitem');
	expect(opened, `${sr.name} announced "${opened}"`).toContain('src');
	expect(opened, `${sr.name} announced "${opened}"`).toContain('level 1');
	// Captured, and worth knowing: the name of an OPEN row is the text of its
	// whole subtree - "src index.ts app.tsrx" - because the row has no accessible
	// name of its own and the reader computes one from its contents. Naming the
	// row from `tree.itemlabel` would need an IDREF handle read on a widget root,
	// which is MARKLESS_ELEMENT_HANDLE_IDREF_WIDGET_ROOT today..
	expect(opened, `${sr.name} announced "${opened}"`).toContain('index.ts');

	// C: the child of the opened node announces the next level down. A tree whose
	// aria-level does not increment announces a flat list.
	const child = await readUntil(sr, { name: 'index.ts' }, 24);
	expect(child, `${sr.name} announced "${child}"`).toContain('level 2');
	expect(child, `${sr.name} announced "${child}"`).toContain('treeitem');
});
