// A module rendered whole renders its default export, not a named export written above it.
import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

async function compile(filename: string, source: string) {
	const result = await compileTsrxModule({ filename, source, symbols: [] });
	expect(result.semanticGraph.diagnostics).toEqual([]);
	return result;
}

const LAYOUT = `export function Shell({ children }) @{
	<div class="shell">{children}</div>
}

export default function Layout({ children }) @{
	<section class="frame">
		<Shell>{children}</Shell>
	</section>
}`;

// The same shape under other names, with two named exports above the default export.
const ALTERNATE = `export function Badge({ label }) @{
	<em>{label}</em>
}

export function Panel({ children, tone }) @{
	<article data-tone={tone}>{children}</article>
}

export default function Board({ children }) @{
	<aside class="board">
		<Badge label="new" />
		<Panel tone="calm">{children}</Panel>
	</aside>
}`;

test('the default export is the render root even when a named export precedes it', async () => {
	const result = await compile('src/Layout.tsrx', LAYOUT);
	expect(result.renderData.root).toEqual({
		componentName: 'Layout',
		templateId: 'template:Layout',
	});
	// The named export still serves on its own when another module imports it by name.
	const shell = result.publicRenderModule.ssrComponentExports?.find(
		(entry) => entry.exportName === 'Shell',
	);
	expect(shell?.ssrFunctionName).toBeDefined();
	expect(shell?.ssrFunctionName).not.toBe('marklessRenderSsr');
});

test('alternate shape: two named exports above the default export', async () => {
	const result = await compile('src/Board.tsrx', ALTERNATE);
	expect(result.renderData.root).toEqual({ componentName: 'Board', templateId: 'template:Board' });
});

test('without a default export the first exported component stays the root', async () => {
	const result = await compile(
		'src/Parts.tsrx',
		`function Inner() @{ <b>inner</b> }
export function First() @{ <p><Inner /></p> }
export function Second() @{ <span>second</span> }`,
	);
	expect(result.renderData.root).toEqual({ componentName: 'First', templateId: 'template:First' });
});
