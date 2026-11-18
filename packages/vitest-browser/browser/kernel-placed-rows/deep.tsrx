import { computed, state } from '@markless/core';
import { loadTodos } from './api.ts';

export default function Outer() @{
	let round = state(0);
	<div><Middle round={round} /></div>
}

function Middle({ round }: { round: number }) @{
	<section><Board round={round} /></section>
}

function Board({ round }: { round: number }) @{
	let query = state('');
	const cards = computed(async () => loadTodos(query, round));
	<aside class="board">
		<input value={query} onInput={(event) => (query = event.target.value)} />
		@try {
			<ul>
				@for (const card of cards; key card.id) {
					<li data-card>{card.name}</li>
				}
			</ul>
		} @pending {
			<p>Loading</p>
		} @catch {
			<p>Failed</p>
		}
	</aside>
}
