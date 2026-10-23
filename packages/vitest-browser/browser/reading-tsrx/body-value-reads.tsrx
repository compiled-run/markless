import { state } from '@markless/core';

export function Shelf() @{
	let shown = state('');
	const sizes = [3, 1, 2];
	const box = { label: 'shelf', items: ['a', 'b'] };
	const names = new Map([[1, 'one'], [2, 'two']]);
	const day = new Date(Date.UTC(2020, 4, 6));
	function describe() {
		return `${box.label}:${box.items.includes('b')}:${names.get(2)}:${day.getUTCDate()}`;
	}
	<main>
		<button type="button" data-sort onClick={() => (shown = sizes.toSorted().join(','))}>sort</button>
		<button type="button" data-describe onClick={() => (shown = describe())}>describe</button>
		<output>{shown}</output>
	</main>
}
