import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../compiler/src/index.ts';

// A served @switch (true) inside a @try picks its arm from the async value the case tests read.
const HELPERS = /from '@markless\/web\/fns\/([^']+)'/g;

async function serverRender(source: string): Promise<string> {
	const compiled = await compileTsrxModule({ filename: 'src/Page.tsrx', source, symbols: [] });
	const ssr = compiled.publicRenderModule.ssrModuleSource.replace(
		HELPERS,
		(_match, helper: string) => `from '${new URL(`../src/fns/${helper}.ts`, import.meta.url).href}'`,
	);
	const module = [
		`const payloadState = ${JSON.stringify(compiled.protocolState)};`,
		`const payloadView = ${JSON.stringify(compiled.protocolView)};`,
		`const marklessRenderData = ${JSON.stringify(compiled.renderData)};`,
		ssr,
		'export { marklessRenderSsr };',
	].join('\n');
	const loaded = (await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(module)}`)) as {
		readonly marklessRenderSsr: () => Promise<{ readonly html: string }>;
	};
	return (await loaded.marklessRenderSsr()).html;
}

test('the @default arm renders with its own constant prop when no case matches', async () => {
	const html = await serverRender(`import { computed } from '@markless/core';
function Tag({ kind, value }) @{
	const label = computed(() => \`tag \${kind}\`);
	<p data-r data-odd={String(value.odd)}>{label}</p>
}
export function Page() @{
	const value = computed(async () => { await new Promise((r) => setTimeout(r, 5)); return { odd: false }; });
	<main>@try {
		@switch (true) {
			@case value.odd: { <Tag kind="odd" value={value} /> }
			@default: { <Tag kind="even" value={value} /> }
		}
	} @pending { <p>loading</p> }</main>
}`);
	expect(html).toContain('>tag even<');
	expect(html).not.toContain('tag odd');
});

test('a later @case renders when only it matches, with different names and arms', async () => {
	const html = await serverRender(`import { computed } from '@markless/core';
function Badge({ tone }) @{
	<em data-badge>{tone}</em>
}
export function Shelf() @{
	const stock = computed(async () => { await new Promise((r) => setTimeout(r, 5)); return { count: 3 }; });
	<section>@try {
		@switch (true) {
			@case stock.count === 0: { <Badge tone="empty" /> }
			@case stock.count < 5: { <Badge tone="low" /> }
			@default: { <Badge tone="plenty" /> }
		}
	} @pending { <i>wait</i> }</section>
}`);
	expect(html).toContain('>low<');
	expect(html).not.toMatch(/>empty<|>plenty</);
});
