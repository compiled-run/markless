import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../src/index.ts';

// A widget's parts are routinely written inside a page-local component that is
// projected into the root - the calendar family's `Month` - rather than
// directly into it. That component renders the parts from its OWN template, so
// their seed pass starts from its render's chunk context, and the enclosing
// widget's seed map has to be in that context or the parts resolve no widget
// instance at all. The symptom was
// MARKLESS_ELEMENT_HANDLE_WIDGET_INSTANCE_MISSING on every SSR row of a family
// whose CSR rows passed: the token the root registered never reached the part
// that minted an id from it.

const page = `
import { state } from '@markless/core';
import { Content, Item, Root, Title, widget } from './widget.tsrx';

export default function Page() @{
	let seen = state('none');

	<section>
		<Root onChange={(next: string) => { seen = next; }}>
			<Month />
		</Root>
		<output data-seen>{seen}</output>
	</section>
}

function Month() @{
	const w = widget();

	<Content>
		<Title>August</Title>
		<div data-days>
			<Item value="2026-08-10" />
		</div>
	</Content>
}
`;

async function ssrSource(source: string) {
	const compiled = await compileTsrxModule({
		filename: 'src/page.tsrx',
		source,
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
	return compiled.publicRenderModule.ssrModuleSource ?? '';
}

test('every component render threads the seed map it was handed into its chunk context', async () => {
	const source = await ssrSource(page);
	const calls = [...source.matchAll(/renderSsrData\(\{[^]*?read:marklessSsrReadData/g)].map(
		(match) => match[0],
	);
	// One per component the module serves: the page and the projecting child.
	expect(calls.length).toBe(2);
	for (const call of calls)
		expect(call).toContain('sharedSeeds:marklessSsrRenderContext?.sharedSeeds');
});

test('the projecting child seeds its parts from the context it rendered with', async () => {
	const source = await ssrSource(page);
	// Every seed pass starts from the context it was rendered with; while the
	// render call threaded nothing, that map started empty and dropped the
	// widget-instance token its parent had registered.
	expect(source).toContain('new Map(marklessSsrDataContext.sharedSeeds??[])');
});
