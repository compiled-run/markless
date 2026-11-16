import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

const compile = (body: string, before = '') =>
	compileTsrxModule({
		filename: '/src/Hand.tsrx',
		buildId: 'event-writes',
		resolverId: 'event-writes',
		symbols: [],
		source: `import { state } from '@markless/core'; ${before} export default function Hand() @{ ${body} }`,
	});

test('an event record names the cells its handler writes that update code reads, a write inside a callback it hands a helper included', async () => {
	const compiled = await compile(
		`let hand = state(['7s']); let clicks = state(0); let shown = state(true);
		<section>
			<p>{hand.length} {clicks}</p>
			<button data-deal onClick={() => glide(() => hand.push('Qh'))}>Draw</button>
			<button data-count onClick={() => { clicks++; shown = !shown; }}>Count</button>
			<button data-read onClick={() => console.log(hand.length)}>Read</button>
		</section>`,
		'function glide(change: () => void) { change(); }',
	);
	const writes = compiled.protocolView.events.map((event) => event.writes);
	expect(writes).toEqual([['state:hand'], ['state:clicks'], undefined]);
});

test('a row event names the cells its handler writes', async () => {
	const compiled = await compile(
		`let hand = state([{ id: '7s' }, { id: 'Qh' }]); let picked = state('');
		<main><output>{picked}</output><ul>@for (const card of hand; key card.id) { <li><button onClick={() => (picked = card.id)}>{card.id}</button></li> }</ul></main>`,
	);
	expect(compiled.protocolView.keyedRepeats?.[0]?.rowEvents.map((event) => event.writes)).toEqual([
		['state:picked'],
	]);
});
