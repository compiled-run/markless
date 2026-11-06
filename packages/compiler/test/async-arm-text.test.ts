import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// Text written straight into a @try arm has no element of its own inside the arm: the
// element around the @try also holds the boundary's markers and siblings, so the read
// must not become a whole-element text write there; the arm re-renders instead.

const ARM_TEXT = `
import { computed } from '@markless/core';

export default function Header() @{
	const todo = computed(async () => ({ name: 'apple' }));

	<section class="header">
		@try {
			<>Editing "{todo.name}"</>
		} @pending {}
		<button>Back</button>
	</section>
}
`;

const ARM_ELEMENT = ARM_TEXT.replace('<>Editing "{todo.name}"</>', '<h2>Editing "{todo.name}"</h2>');

async function view(source: string) {
	const compiled = await compileTsrxModule({ filename: 'src/Header.tsrx', source, symbols: [] });
	return compiled.protocolView as unknown as {
		readonly locators: ReadonlyArray<{ readonly hostNodeId: string; readonly tagName?: string }>;
		readonly domUpdates: ReadonlyArray<{ readonly hostNodeId: string; readonly graphNodeId: string }>;
		readonly asyncBoundaries: ReadonlyArray<{ readonly id: string; readonly rerendersOnRefresh?: true }>;
	};
}

test('text written straight into a @try arm writes no text to the element around the @try', async () => {
	const payload = await view(ARM_TEXT);
	// The arm's text is the only read on the page, so no element takes a write.
	expect(payload.domUpdates).toEqual([]);
	expect(payload.asyncBoundaries.map((boundary) => boundary.rerendersOnRefresh)).toEqual([true]);
});

test('text inside an element of the @try arm keeps its in-place update', async () => {
	const payload = await view(ARM_ELEMENT);
	const section = payload.locators.find((locator) => locator.tagName === 'section')?.hostNodeId;
	expect(payload.domUpdates.filter((update) => update.hostNodeId !== section)).toHaveLength(1);
	expect(payload.asyncBoundaries.map((boundary) => boundary.rerendersOnRefresh)).toEqual([undefined]);
});
