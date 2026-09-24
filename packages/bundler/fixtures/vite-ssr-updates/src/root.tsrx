import { computed, state } from '@markless/core';
import { EMPTY, TABS, shout } from './data.ts';

export function App() @{
	let rows = state([
		{ id: 'a', name: 'Alpha' },
		{ id: 'b', name: 'Beta' },
	]);
	let picked = state('');
	let draft = state('x');
	let tab = state('first');
	let a = state(1);
	let b = state(2);
	let c = state(3);
	const visible = computed(() => rows.filter((row) => row.id !== ''));

	<main>
		<ul>
			@for (const row of visible; key row.id) {
				<li data-id={row.id} title={`Row ${row.name}`} data-picked={picked === row.id ? 'yes' : 'no'}>
					<span>{shout(row.name)}</span>
					<button
						class="rename"
						onClick={() => (rows = rows.map((item) => (item.id === row.id ? { ...item, name: `${item.name}!` } : item)))}
					>rename</button>
				</li>
			}
		</ul>
		<button id="pick-b" onClick={() => (picked = 'b')}>pick b</button>
		<button id="replace" onClick={() => (rows = [{ id: 'c', name: 'Gamma' }, ...rows.slice(1)])}>replace</button>
		<button id="clear-draft" onClick={() => (draft = ' ')}>clear draft</button>
		<button id="save" disabled={draft.trim() === EMPTY}>save</button>
		<button id="tab-second" aria-selected={tab === TABS[1].id ? 'true' : 'false'} onClick={() => (tab = TABS[1].id)}>second</button>
		<p id="multi">{a}|{b}|{c}</p>
		<button id="bump" onClick={() => {
			a++;
			b++;
			c++;
		}}>bump</button>
	</main>
}
