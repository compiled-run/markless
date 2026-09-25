import { computed, state } from '@markless/core';

export function App() @{
	let entries = state([
		{ slug: 'a', title: 'Alpha' },
		{ slug: 'b', title: 'Beta' },
		{ slug: 'c', title: 'Gamma' },
	]);
	let chosen = state('');
	const marked = computed(() => chosen.toUpperCase());

	<main>
		<output id="chosen">{chosen}</output>
		<button id="choose-c" onClick={() => (chosen = 'c')}>choose c</button>
		<button id="append" onClick={() => (entries = [...entries, { slug: 'd', title: 'Delta' }])}>append</button>
		<ul>
			@for (const entry of entries; key entry.slug) {
				<li data-slug={entry.slug} class={chosen === entry.slug ? 'chosen' : 'idle'}>
					<button class="choose" onClick={() => (chosen = entry.slug)}>{entry.title}</button>
					<span class="flag">{chosen === entry.slug ? 'on' : 'off'}</span>
					<span class="mark">{marked}</span>
				</li>
			}
		</ul>
		<style>
			.chosen { outline: 1px solid; }
		</style>
	</main>
}
