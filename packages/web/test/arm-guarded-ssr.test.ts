import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../compiler/src/index.ts';

const HELPERS = /from '@markless\/web\/fns\/([^']+)'/g;

async function serverRender(source: string) {
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
	)) as { readonly marklessRenderSsr: () => Promise<{ readonly html: string }> };
	return (await loaded.marklessRenderSsr()).html;
}

// The server derives every computed before it renders, so an arm's expressions must hold only where the arm renders.
test('the server renders the other arm when an @if test is false, without running the guarded arm', async () => {
	const html = await serverRender(`
import { state } from '@markless/core';

export default function Absent() @{
	let item = state<{ label: string } | undefined>(undefined);

	<section>
		@if (item) {
			<b>{item.label.toLowerCase()}</b>
		} @else {
			<span>Missing</span>
		}
	</section>
}`);
	expect(html).toContain('<span>Missing</span>');
	expect(html).not.toContain('<b>');
});

test('the server renders an @switch default arm without running the case arm that reads past a missing value', async () => {
	const html = await serverRender(`
import { state } from '@markless/core';

export function Card() @{
	let kind = state('none');
	let entry = state<{ tags: string[] } | null>(null);

	<div>
		@switch (kind) {
			@case 'tagged': {
				<ul data-first={entry.tags[0].trim()}>{entry.tags.join(', ')}</ul>
			}
			@default: {
				<i>untagged</i>
			}
		}
	</div>
}`);
	expect(html).toContain('<i>untagged</i>');
});
