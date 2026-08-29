import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../compiler/src/index.ts';

/**
 * A component whose whole body is a branch over two other components has markup
 * of its own - the branch is the markup - but no element tag. The server path
 * used to answer such a component only when it opened with an element, so it was
 * published under no name and never emitted a render function of its own; a page
 * that placed it got the module's default component instead, wearing the props
 * meant for the branch and leaving its children outside.
 *
 * Both halves are pinned here because a delegating component is reached two ways:
 * a same-module placement resolves to a local render function, and an imported
 * placement resolves through the module's published SSR export names.
 */

const HELPERS = /from '@markless\/web\/fns\/([^']+)'/g;

async function serverRender(source: string, props: Record<string, unknown> = {}) {
	const compiled = await compileTsrxModule({ filename: 'src/Page.tsrx', source, symbols: [] });
	const ssr = compiled.publicRenderModule.ssrModuleSource.replace(
		HELPERS,
		(_match, helper: string) =>
			`from '${new URL(`../src/fns/${helper}.ts`, import.meta.url).href}'`,
	);
	const module = [
		`const payloadState = ${JSON.stringify(compiled.protocolState)};`,
		`const payloadView = ${JSON.stringify(compiled.protocolView)};`,
		`const marklessRenderData = ${JSON.stringify(compiled.renderData)};`,
		ssr,
		'export { marklessRenderSsr };',
	].join('\n');
	const loaded = (await import(
		`data:text/javascript;charset=utf-8,${encodeURIComponent(module)}`
	)) as {
		readonly marklessRenderSsr: (
			props?: Record<string, unknown>,
		) => Promise<{ readonly html: string }>;
	};
	const { html } = await loaded.marklessRenderSsr(props);
	return { html, compiled };
}

// Both fixtures are the same shape - a component whose body is only a branch over
// two component placements - with every name, tag, prop and declaration order
// changed, so nothing here can be answered by recognising one of them.

const CELL = `
function DataCell({ children, ...rest }) @{
	<td data-cell {...rest}>{children}</td>
}

function HeaderCell({ children, ...rest }) @{
	<th data-header {...rest}>{children}</th>
}

function Cell({ heading = false, children, ...rest }) @{
	@if (heading) {
		<HeaderCell {...rest}>{children}</HeaderCell>
	} @else {
		<DataCell {...rest}>{children}</DataCell>
	}
}

export function Grid() @{
	<table data-grid>
		<tbody>
			<tr>
				<Cell heading data-name>README</Cell>
				<Cell data-size>4.1 kB</Cell>
			</tr>
		</tbody>
	</table>
}
`;

const NOTE = `
export function Panel() @{
	<section data-panel>
		<Marker loud data-first>alpha</Marker>
		<Marker data-second>beta</Marker>
	</section>
}

function Marker({ loud = false, children, ...rest }) @{
	@if (loud) {
		<Shout {...rest}>{children}</Shout>
	} @else {
		<Murmur {...rest}>{children}</Murmur>
	}
}

function Murmur({ children, ...rest }) @{
	<small data-murmur {...rest}>{children}</small>
}

function Shout({ children, ...rest }) @{
	<strong data-shout {...rest}>{children}</strong>
}
`;

test('a branch-only component serves the element its taken arm renders', async () => {
	const { html } = await serverRender(CELL);

	expect(html).toContain('<th data-header');
	expect(html).toContain('<td data-cell');
	// The arm's own tag keeps the placement's props and its children stay inside it.
	expect(html).toMatch(/<th [^>]*data-name[^>]*>README<\/th>/);
	expect(html).toMatch(/<td [^>]*data-size[^>]*>4\.1 kB<\/td>/);
	// The prop the branch consumed is never spread onto a served element.
	expect(html).not.toContain('heading');
});

test('a branch-only component serves its arm whatever the module declares first', async () => {
	const { html } = await serverRender(NOTE);

	expect(html).toMatch(/<strong [^>]*data-first[^>]*>alpha<\/strong>/);
	expect(html).toMatch(/<small [^>]*data-second[^>]*>beta<\/small>/);
	expect(html).not.toContain('loud');
});

test('a branch-only component is published under its own SSR export name', async () => {
	const source = CELL.replace('function Cell(', 'export function Cell(');
	const { compiled } = await serverRender(source);
	const published = compiled.publicRenderModule.ssrComponentExports.map(
		(entry) => entry.exportName,
	);

	// An imported placement resolves by export name; a name the module withholds
	// falls back to the module's default component, which is the wrong element.
	expect(published).toContain('Cell');
});
