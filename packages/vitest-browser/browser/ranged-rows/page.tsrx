import { state } from '@markless/core';
import { Pair } from './pair.tsrx';

type Entry = { readonly id: string; readonly term: string; readonly def: string };

export default function RangedRowsPage() @{
	let pairs = state<ReadonlyArray<Entry>>([
		{ id: 'a', term: 'A', def: 'alpha' },
		{ id: 'b', term: 'B', def: 'beta' },
		{ id: 'c', term: 'C', def: 'gamma' },
	]);
	let picked = state('none');
	let words = state(['one', 'two']);

	<main>
		<dl data-list="inline">
			<dt data-head>head</dt>
			@for (const pair of pairs; key pair.id) {
				<>
					<dt data-term={pair.id} onClick={() => (picked = pair.id)}>{pair.term}</dt>
					<dd data-def={pair.id}>{pair.def}</dd>
					<input data-input={pair.id} />
				</>
			}
			<dd data-tail>tail</dd>
		</dl>
		<p data-picked>{picked}</p>
		<dl data-list="component">
			@for (const pair of pairs; key pair.id) {
				<Pair pair={pair} />
			}
		</dl>
		<p data-list="words">
			@for (const word of words; key word) {
				{word}
			}
		</p>
		<button data-reverse onClick={() => (pairs = [...pairs].reverse())}>reverse</button>
		<button
			data-add
			onClick={() => (pairs = [...pairs, { id: 'd', term: 'D', def: 'delta' }])}
		>
			add
		</button>
		<button data-remove-first onClick={() => (pairs = pairs.slice(1))}>remove</button>
		<button
			data-rename
			onClick={() =>
				(pairs = pairs.map((pair) => (pair.id === 'b' ? { ...pair, def: 'BETA' } : pair)))
			}
		>
			rename
		</button>
		<button data-refresh onClick={() => (pairs = pairs.map((pair) => ({ ...pair })))}>
			refresh
		</button>
		<button data-words onClick={() => (words = ['two', 'three', 'one'])}>words</button>
	</main>
}
