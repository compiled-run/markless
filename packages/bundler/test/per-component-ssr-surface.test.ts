import { expect, test } from 'vitest';
import { transformTsrxModule } from '../src/transform.ts';

// A compound family authored in ONE module (root/trigger/content) is composed
// part by part from another module. The module surface therefore has to carry
// one SSR entry per exported component, not just the module root's, or every
// part server-renders the root's markup.
const familySource = `
import { shared, state } from '@markless/core';

export const sel = shared(() => {
	const s = state({ open: false });
	return { ...s, toggle() { s.open = !s.open; } };
}, { scope: 'widget' });

export function Root({ children }) @{
	const s = sel();
	<div data-sel-root ui-open={s.open}>{children}</div>
}

export function Trigger() @{
	const s = sel();
	<button type="button" data-sel-trigger onClick={() => s.toggle()}>Toggle</button>
}

export function Content() @{
	const s = sel();
	<span data-sel-content>{s.open}</span>
}
`;

test('a server module exposes one SSR entry per exported component of its family', async () => {
	const result = await transformTsrxModule({
		filename: '/workspace/app/src/sel.tsrx',
		source: familySource,
		environment: 'server',
	});

	expect(result.code).toContain('async function marklessRenderSsrTrigger(');
	expect(result.code).toContain('async function marklessRenderSsrContent(');
	expect(result.code).toContain('renderSsrComponents: {');
	expect(result.code).toContain('"Root": { renderSsr: marklessRenderSsr }');
	expect(result.code).toContain('"Trigger": { renderSsr: marklessRenderSsrTrigger }');
	expect(result.code).toContain('"Content": { renderSsr: marklessRenderSsrContent }');
	// The root keeps `renderSsr`, so every consumer that renders the module as a
	// page is untouched.
	expect(result.code).toContain('return marklessRenderSsr(props, marklessRenderContext);');
});

test('a single-component module keeps its root entry alone', async () => {
	const result = await transformTsrxModule({
		filename: '/workspace/app/src/page.tsrx',
		source: `export default function Page() @{ <main>Hi</main> }`,
		environment: 'server',
	});

	expect(result.code).toContain('return marklessRenderSsr(props, marklessRenderContext);');
	expect(result.code).not.toContain('renderSsrComponents');
});

test('a composed child names the component it declared, not the module', async () => {
	const result = await transformTsrxModule({
		filename: '/workspace/app/src/page.tsrx',
		source: `
import { Content, Root, Trigger } from './sel.tsrx';

export default function SelPage() @{
	<section><Root><Trigger /><Content /></Root></section>
}
`,
		environment: 'server',
	});

	expect(result.code).toContain('marklessSsrComponentPart(__marklessSsrComponent1, "Trigger")');
	expect(result.code).toContain('marklessSsrComponentPart(__marklessSsrComponent2, "Content")');
});

// A parts barrel aliases the family's exports to lowercase member names, and
// the tag `<sel.trigger />` resolves through it. The linked edge names the
// component the family module declares, so the same per-component entry answers.
test('a barrel-aliased member tag resolves the part its export names', async () => {
	const result = await transformTsrxModule({
		filename: '/workspace/app/src/page.tsrx',
		source: `
import * as sel from './sel-barrel.ts';

export default function SelPage() @{
	<section><sel.root><sel.trigger /></sel.root></section>
}
`,
		environment: 'server',
		importedModuleInterfaces: {
			'./sel-barrel.ts': {
				passId: 'module-graph-interface',
				filename: '/workspace/app/src/sel-barrel.ts',
				exports: [],
				linkedComponents: [
					{
						exportPath: ['root'],
						source: './sel.tsrx',
						importKind: 'named',
						importedName: 'Root',
						componentName: 'Root',
					},
					{
						exportPath: ['trigger'],
						source: './sel.tsrx',
						importKind: 'named',
						importedName: 'Trigger',
						componentName: 'Trigger',
					},
				],
				render: { version: 1, components: [] },
			},
		},
	});

	expect(result.code).toContain('marklessSsrComponentPart(__marklessSsrComponent0, "Root")');
	expect(result.code).toContain('marklessSsrComponentPart(__marklessSsrComponent1, "Trigger")');
});
