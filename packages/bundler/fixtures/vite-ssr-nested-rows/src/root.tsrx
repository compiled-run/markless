import { computed, state } from '@markless/core';
import { Board } from './board.tsrx';

export function App() @{
	let groups = state([
		{ id: 'g1', name: 'One', picks: 0, items: [{ id: 'a', hits: 0 }, { id: 'b', hits: 0 }, { id: 'c', hits: 0 }] },
		{ id: 'g2', name: 'Two', picks: 0, items: [{ id: 'd', hits: 0 }, { id: 'e', hits: 0 }, { id: 'f', hits: 0 }] },
		{ id: 'g3', name: 'Three', picks: 0, items: [{ id: 'g', hits: 0 }, { id: 'h', hits: 0 }, { id: 'i', hits: 0 }] },
	]);
	let last = state('none');
	const tally = computed(() => groups.map((group) => `${group.id}=${group.picks}`).join(' '));

	<main>
		<section class="groups">
			@for (const group of groups; key group.id) {
				<article data-group={group.id}>
					<h2>{group.name} {group.picks}</h2>
					<ul>
						@for (const item of group.items; key item.id) {
							<li data-item={item.id}>
								<button class="pick" onClick={() => { group.picks++; item.hits++; last = item.id; }}>{item.id}</button>
								<span class="hits">{item.hits}</span>
							</li>
						}
					</ul>
				</article>
			}
		</section>
		<output id="last">{last}</output>
		<output id="tally">{tally}</output>
		<button id="reverse" onClick={() => (groups = [...groups].reverse())}>reverse</button>
		<button id="insert" onClick={() => (groups = [{ id: 'g0', name: 'Zero', picks: 0, items: [{ id: 'x', hits: 0 }, { id: 'y', hits: 0 }] }, ...groups])}>insert</button>
		<button id="remove" onClick={() => (groups = groups.filter((group) => group.id !== 'g2'))}>remove</button>
		<Board />
	</main>
}
