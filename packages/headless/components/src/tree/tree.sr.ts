import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, readUntil, type Conveys } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Nested from './scenarios/nested.tsrx';

// Rows assert the facts an announcement must convey - role, name, state - never a reader product's wording.
// Grouped into few rows on purpose: this lane runs files in parallel, and a row-per-sequence version pushed three other families past their poll ceiling.
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

test('reading a closed tree conveys the container, the closed parent and the end node', async () => {
	await open(Nested);

	// `tree` has no vocabulary slot, so the role word is asserted on the phrase; the name comes from the consumer's aria-label.
	const container = await readUntil(sr, { name: 'Project files' });
	expect(container, `${sr.name} announced "${container}"`).toContain('tree');

	// A closed folder omits aria-expanded, so no open state is announced for it.
	const parent = await readUntil(sr, { name: 'src' });
	expectConveys(parent, { name: 'src' });
	expect(parent, `${sr.name} announced "${parent}"`).not.toContain('collapsed');
	expect(parent, `${sr.name} announced "${parent}"`).toContain('treeitem');
	expect(parent, `${sr.name} announced "${parent}"`).toContain('level 1');

	// The opening control is named by its node through a compiler-resolved handle, not an id anyone spelled.
	expectConveys(await readUntil(sr, { role: 'button' }), { role: 'button', name: 'src' });

	// An end node carries no open state, and aria-selected="false" reads as "not selected".
	const leaf = await readUntil(sr, { name: 'README.md' });
	expect(leaf, `${sr.name} announced "${leaf}"`).toContain('treeitem');
	expect(leaf, `${sr.name} announced "${leaf}"`).toContain('level 1');
	expect(leaf).not.toContain('expanded');
	expect(leaf, `${sr.name} announced "${leaf}"`).toContain('not selected');

	// The children of the closed folder were never on screen, so the walk passed over them rather than through them.
	const spoken = (await sr.spokenPhraseLog()).join(' | ');
	expect(spoken).not.toContain('index.ts');
	expect(spoken).not.toContain('app.tsrx');
});

// The level change is the point: a tree whose aria-level does not increment announces a flat list.
test('opening a node announces it as expanded, and descending announces the next level', async () => {
	const { container } = await render(Nested);
	mounted = container as unknown as HTMLElement;
	const row = mounted.querySelector('[data-testid="src-item"]') as HTMLElement;
	// Plain loop, not a poll: this lane runs files in parallel, and a gesture bounded by a poll ceiling goes red under that load.
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
	// An open row's name is its whole subtree's text, because the row has no accessible name of its own.
	expect(opened, `${sr.name} announced "${opened}"`).toContain('index.ts');

	const child = await readUntil(sr, { name: 'index.ts' }, 24);
	expect(child, `${sr.name} announced "${child}"`).toContain('level 2');
	expect(child, `${sr.name} announced "${child}"`).toContain('treeitem');
});
