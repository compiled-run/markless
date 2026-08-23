import { expect, test } from 'vitest';
import { collectTsrxModuleDiagnostics, compileTsrxModule } from '../src/index.ts';

// Two sibling `@for` loops that both call their item `row` is ordinary authoring,
// and it used to emit `const row=...;const row=...;` into one shared row-reader
// scope in `public-render/ssr-module.ts` - a module that does not parse, so the
// consumer got a raw SyntaxError. The row prelude is one scope shared by every
// row render, and the binding is the same expression whichever loop asked for it,
// so the name is declared once. The one clash that scope genuinely cannot serve -
// a name that is one loop's ITEM and another loop's INDEX - is refused with a
// diagnostic naming both loops instead.

const siblingLoopsSource = `import { state } from '@markless/core';

export default function Board() @{
	let left = state([{ id: 'l1', label: 'Left one' }, { id: 'l2', label: 'Left two' }]);
	let right = state([{ id: 'r1', label: 'Right one' }]);

	<main>
		<ul class="left">
			@for (const row of left; key row.id) {
				<li data-side="left">{row.label}</li>
			}
		</ul>
		<ul class="right">
			@for (const row of right; key row.id) {
				<li data-side="right">{row.label}</li>
			}
		</ul>
	</main>
}`;

const nestedLoopsSource = `import { state } from '@markless/core';

export default function Tree() @{
	let groups = state([
		{ id: 'g1', label: 'Group one', rows: [{ id: 'g1a', label: 'Leaf A' }] },
		{ id: 'g2', label: 'Group two', rows: [{ id: 'g2a', label: 'Leaf B' }] },
	]);

	<ul class="tree">
		@for (const row of groups; key row.id) {
			<li data-depth="0">
				<span class="group">{row.label}</span>
				<ul>
					@for (const row of row.rows; key row.id) {
						<li data-depth="1">{row.label}</li>
					}
				</ul>
			</li>
		}
	</ul>
}`;

const itemVersusIndexSource = `import { state } from '@markless/core';

export default function Clash() @{
	let first = state([{ id: 'f1', label: 'First' }]);
	let second = state([{ id: 's1', label: 'Second' }]);

	<main>
		<ul class="first">
			@for (const i of first; key i.id) {
				<li>{i.label}</li>
			}
		</ul>
		<ul class="second">
			@for (const entry of second; index i; key entry.id) {
				<li>{entry.label}{i}</li>
			}
		</ul>
	</main>
}`;

type SsrRenderOutput = { readonly html: string };

async function compilePage(filename: string, source: string) {
	return compileTsrxModule({ filename, source, symbols: [] });
}

function ssrTestModuleSource(page: Awaited<ReturnType<typeof compileTsrxModule>>): string {
	const publicRenderModule = page.publicRenderModule;
	if (!publicRenderModule) throw new Error('no public render module');
	return [
		`const payloadState = ${JSON.stringify(page.protocolState)};`,
		`const payloadView = ${JSON.stringify(page.protocolView)};`,
		publicRenderModule.renderDataModuleSource,
		publicRenderModule.ssrModuleSource,
		'export { marklessRenderSsr };',
	].join('\n');
}

/** Importing is the parse check: a duplicate `const` fails here, not at a assert. */
async function importSsrModule(source: string) {
	const testSource = source.replace(
		/from (['"])@markless\/web\/fns\/([^'"]+)\1/g,
		(_match, _quote: string, helperModule: string) =>
			`from '${new URL(`../../web/src/fns/${helperModule}.ts`, import.meta.url).href}'`,
	);
	return (await import(
		`data:text/javascript;charset=utf-8,${encodeURIComponent(testSource)}`
	)) as Record<string, unknown>;
}

async function renderHtml(filename: string, source: string): Promise<string> {
	const page = await compilePage(filename, source);
	expect(
		collectTsrxModuleDiagnostics(page).filter((diagnostic) => diagnostic.severity === 'error'),
	).toEqual([]);
	const ssrModule = await importSsrModule(ssrTestModuleSource(page));
	const output = await (ssrModule.marklessRenderSsr as () => Promise<SsrRenderOutput>)();
	return output.html;
}

test('two sibling @for loops binding the same name declare it once', async () => {
	const page = await compilePage('src/Board.tsrx', siblingLoopsSource);
	const ssr = page.publicRenderModule?.ssrModuleSource ?? '';

	// One declaration per shared row reader, not one per loop.
	const declarations = ssr.match(/const row=marklessSsrDataContext\.repeatItem;/g) ?? [];
	const readers = ssr.match(/const error=marklessSsrDataContext\.asyncError;/g) ?? [];
	expect(readers.length).toBeGreaterThan(0);
	expect(declarations.length).toBe(readers.length);
});

test('two sibling @for loops binding the same name render their own items', async () => {
	const html = await renderHtml('src/Board.tsrx', siblingLoopsSource);

	expect(html).toContain('<li data-side="left">Left one</li>');
	expect(html).toContain('<li data-side="left">Left two</li>');
	expect(html).toContain('<li data-side="right">Right one</li>');
	// The right list rendered its own rows, not the left list's.
	expect(html).not.toContain('<li data-side="right">Left one</li>');
});

test('nested @for loops binding the same name render each depth its own item', async () => {
	const html = await renderHtml('src/Tree.tsrx', nestedLoopsSource);

	expect(html).toContain('<span class="group">Group one</span>');
	expect(html).toContain('<span class="group">Group two</span>');
	expect(html).toContain('<li data-depth="1">Leaf A</li>');
	expect(html).toContain('<li data-depth="1">Leaf B</li>');
});

test('a name that is one loop\'s item and another loop\'s index is refused loudly', async () => {
	const page = await compilePage('src/Clash.tsrx', itemVersusIndexSource);
	const conflict = collectTsrxModuleDiagnostics(page).find(
		(diagnostic) => diagnostic.code === 'MARKLESS_REPEAT_BINDING_NAME_CONFLICT',
	);

	expect(conflict?.severity).toBe('error');
	expect(conflict?.message).toContain('"i"');
	// The span points at the loop that redefines the name, so both are findable.
	expect(conflict?.primarySpan?.filename).toBe('src/Clash.tsrx');
	expect(typeof conflict?.primarySpan?.start).toBe('number');
});
