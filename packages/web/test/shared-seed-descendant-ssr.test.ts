import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../compiler/src/index.ts';

// A body seed of an app-scoped shared instance is the request's value of that node,
// so every component rendered beneath the seeding body reads the seed, not the factory initial.

const HELPERS = /from '@markless\/web\/fns\/([^']+)'/g;

async function serverRender(source: string, props: Record<string, unknown>) {
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
		) => Promise<{ readonly html: string; readonly state: unknown }>;
	};
	return loaded.marklessRenderSsr(props);
}

const VIEWER = `
import { shared, state } from '@markless/core';

const viewer = shared(() => {
	const v = state({ name: 'nobody' });
	return { ...v };
}, { scope: 'app' });

function Badge() @{
	const v = viewer();
	<p data-badge>{v.name}</p>
}

function Card() @{
	<section>
		<Badge />
	</section>
}

export default function Page({ who }) @{
	const v = viewer();
	v.name = who;

	<main>
		<h1 data-heading>{v.name}</h1>
		<Badge />
		<Card />
	</main>
}
`;

const ACCOUNT = `
import { shared, state } from '@markless/core';

export const account = shared(() => {
	const profile = state({ plan: 'free', seats: 1 });
	return { ...profile };
});

function Seats() @{
	const a = account();
	<em data-seats>{a.seats}</em>
}

function Plan() @{
	const current = account();
	<div>
		<strong data-plan>{current.plan}</strong>
		<Seats />
	</div>
}

export function Billing({ tier, count }) @{
	const acct = account();
	acct.seats = count;
	acct.plan = tier;

	<article>
		<Plan />
	</article>
}
`;

test('a child and a grandchild of the seeding page read the seeded value', async () => {
	const { html, state } = await serverRender(VIEWER, { who: 'zed' });

	expect(html.match(/data-heading="">([^<]*)</)?.[1]).toBe('zed');
	expect([...html.matchAll(/data-badge="">([^<]*)</g)].map((match) => match[1])).toEqual([
		'zed',
		'zed',
	]);
	expect(JSON.stringify(state)).not.toContain('nobody');
});

test('an alternate-shaped family with two seeded fields and the default scope reads both seeds below', async () => {
	const { html, state } = await serverRender(ACCOUNT, { tier: 'team', count: 7 });

	expect(html.match(/data-plan="">([^<]*)</)?.[1]).toBe('team');
	expect(html.match(/data-seats="">([^<]*)</)?.[1]).toBe('7');
	expect(JSON.stringify(state)).not.toContain('free');
});

test('one render does not leak its seed into the next', async () => {
	await serverRender(VIEWER, { who: 'first' });
	const { html } = await serverRender(VIEWER, { who: 'second' });

	expect(html).not.toContain('first');
	expect([...html.matchAll(/data-badge="">([^<]*)</g)].map((match) => match[1])).toEqual([
		'second',
		'second',
	]);
});
