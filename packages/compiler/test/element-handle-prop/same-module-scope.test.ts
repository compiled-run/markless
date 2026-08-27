import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../src/index.ts';

/**
 * A page mints `element()` and hands it to a part declared in the same module.
 * The part destructures a prop of the same name, so a module-wide name lookup
 * answered the page's `el={target}` with the part's prop: the page's binding was
 * refused as a nested prop forward and its handle never reached the served
 * handle records. Both lookups resolve in the declaring component instead.
 */

async function compile(filename: string, source: string) {
	return compileTsrxModule({ filename, source, symbols: [] });
}

function handleNames(result: Awaited<ReturnType<typeof compile>>) {
	return result.payloadArena.view.elementHandles.map((handle) => handle.handleId).sort();
}

test('a page handle bound beside a same-module part that shadows its name still resolves', async () => {
	const result = await compile(
		'src/SameModule.tsrx',
		`
import { element } from '@markless/core';

function SameSpot({ target }) @{
	const rootEl = element<HTMLDivElement>();

	<div el={rootEl} onClick={() => {
		rootEl?.setAttribute('data-probe', typeof target);
	}}>measure</div>
}

export default function Page() @{
	const target = element<HTMLButtonElement>();

	<section>
		<button type="button" el={target}>Save</button>
		<SameSpot target={target} />
	</section>
}
`,
	);

	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(handleNames(result)).toEqual(['element:rootEl', 'element:target']);
	expect(
		result.payloadArena.view.elementHandles.find(
			(handle) => handle.handleId === 'element:target',
		)?.hostNodeId,
	).toBe(
		result.semanticGraph.elementHandleBindings.find(
			(binding) => binding.componentName === 'Page',
		)?.hostNodeId,
	);
});

// Alternate shape: different component, prop, handle and element names, the
// shadowing part declared AFTER the page, and the shadowed name bound on a
// nested element rather than a direct child of the component root.
test('the scoping follows the shape, not the fixture names', async () => {
	const result = await compile(
		'src/Alternate.tsrx',
		`
import { element } from '@markless/core';

export default function Board() @{
	const anchorEl = element<HTMLAnchorElement>();

	<main>
		<nav><a href="#x" el={anchorEl}>Go</a></nav>
		<Marker anchorEl={anchorEl} />
	</main>
}

function Marker({ anchorEl }) @{
	const boxEl = element<HTMLSpanElement>();

	<span el={boxEl} onClick={() => {
		boxEl?.setAttribute('data-kind', typeof anchorEl);
	}}>mark</span>
}
`,
	);

	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(handleNames(result)).toEqual(['element:anchorEl', 'element:boxEl']);
});

// The part in the same module binds the forwarded handle on its own markup: the
// prop route still resolves as a prop, it is only looked up in the part's scope.
test('a same-module part can bind the handle it was handed', async () => {
	const result = await compile(
		'src/Forwarded.tsrx',
		`
import { element } from '@markless/core';

function Frame({ slotEl }) @{
	<div el={slotEl}>framed</div>
}

export default function Shell() @{
	const slotEl = element<HTMLDivElement>();

	<section>
		<Frame slotEl={slotEl} />
	</section>
}
`,
	);

	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(handleNames(result)).toEqual(['element:slotEl']);
});

// The refusal the diagnostic's text actually names survives: a handle reached
// through a nested object prop names no one parent-owned handle.
test('a handle reached through a nested object prop is still refused', async () => {
	const result = await compile(
		'src/Nested.tsrx',
		`
import { element } from '@markless/core';

function Nested({ step }) @{
	<div el={step.target}>nested</div>
}

export default function NestedPage() @{
	const target = element<HTMLButtonElement>();

	<section>
		<button type="button" el={target}>Save</button>
		<Nested step={{ target }} />
	</section>
}
`,
	);

	const codes = result.semanticGraph.diagnostics.map((diagnostic) => diagnostic.code);
	expect(codes).toContain('MARKLESS_ELEMENT_HANDLE_PROP_UNSUPPORTED');
});
