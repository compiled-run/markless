import { state } from '@markless/core';

export function Shop() @{
	let bags = state(1);
	let log = state('');
	let items = state([
		{ id: 'house', name: 'House blend' },
		{ id: 'dark', name: 'Dark roast' },
	]);
	const step = 2;
	function note(text: string) {
		log = log ? `${log}, ${text}` : text;
	}
	function add(count: number) {
		bags = bags + count;
		note(`added ${count}`);
	}
	const pick = (name: string) => note(name.toLowerCase());
	<main>
		<button type="button" data-add onClick={() => add(step)}>add</button>
		<button type="button" data-add-one onClick={() => { add(1); }}>add one</button>
		<ul>
			@for (const item of items; key item.id) {
				<li data-item={item.id} onClick={() => pick(item.name)}>{item.name}</li>
			}
		</ul>
		<output data-bags>{bags}</output>
		<output data-log>{log}</output>
	</main>
}
