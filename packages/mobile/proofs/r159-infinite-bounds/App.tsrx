import { state } from '@markless/core';

function describe(limit: number): string {
	let words = '';
	for (const part of [limit > 1000 ? 'huge' : 'small', Number.isFinite(limit) ? 'bounded' : 'unbounded']) words += `${part} `;
	return words.trim();
}

export default function App() @{
	const box = state({ min: 40, max: Number.POSITIVE_INFINITY, low: -Infinity });
	<main>
		<h1>Bounds</h1>
		<p>{`max ${String(box.max)}`}</p>
		<p>{`low ${String(box.low)}`}</p>
		<p>{describe(box.max)}</p>
		<button onClick={() => (box.max = Math.min(box.max, 100))}>Cap</button>
		<button onClick={() => (box.max = Number.POSITIVE_INFINITY)}>Uncap</button>
	</main>
}
