import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../compiler/src/index.ts';

// A lean dispatch path settles a navigation's wait when the handler returns; it has no authored await to settle at,
// because a handler with one never gets a lean plan.

async function plans(name: string, body: string) {
	const compiled = await compileTsrxModule({
		filename: `/src/${name}.tsrx`,
		buildId: 'lean-await',
		resolverId: 'lean-await',
		symbols: [],
		source: `import { state, computed } from '@markless/core'; export default function ${name}() @{ ${body} }`,
	});
	return Object.values(compiled.runtimeDemandMaps).flatMap((map) =>
		map.actions.map((action) => action.plan?.kind ?? null),
	);
}

test('a handler that awaits gets no lean plan', async () => {
	expect(
		await plans(
			'Awaits',
			`let held = state('idle'); <section><button onClick={async () => { held = 'holding'; await fetch('/hold'); }}>Hold</button><span>{held}</span></section>`,
		),
	).toEqual([null, null]);
	expect(
		await plans(
			'AwaitsAfter',
			`let n = state(0); <section><button onClick={async () => { n++; await fetch('/hold'); }}>Hold</button><span>{n}</span></section>`,
		),
	).toEqual([null, null]);
});

test('a handler that returns a promise without awaiting it can be lean', async () => {
	expect(
		await plans(
			'Returns',
			`let held = state('idle'); <section><button onClick={() => { held = 'holding'; return fetch('/hold'); }}>Hold</button><span>{held}</span></section>`,
		),
	).toContain('closure');
});
