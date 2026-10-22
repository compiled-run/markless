import { state } from '@markless/core';

function Chooser({ onChoose }: { readonly onChoose: (label: string) => void }) @{
	<button type="button" data-choose onClick={() => onChoose('abc')}>choose</button>
}

function Shop({ unit }: { readonly unit: number }) @{
	const fruits = state([{ id: 'pear' }, { id: 'fig' }]);
	let total = state(0);
	let last = state('none');
	const bonus = 10;
	function note(text: string) {
		last = text;
	}
	function add(count: number) {
		total = total + count * unit;
		note('added ' + count);
	}
	const addBonus = () => add(bonus);
	function pickLabel(label: string) {
		add(label.length);
	}
	<main>
		<button type="button" data-add onClick={() => add(2)}>add</button>
		<button type="button" data-bonus onClick={() => addBonus()}>bonus</button>
		<ul>
			@for (const fruit of fruits; key fruit.id) {
				<li><button type="button" data-fruit={fruit.id} onClick={() => note(fruit.id)}>{fruit.id}</button></li>
			}
		</ul>
		<Chooser onChoose={pickLabel} />
		<output data-total>{total}</output>
		<output data-last>{last}</output>
	</main>
}

export function ShopPage() @{
	<Shop unit={3} />
}
