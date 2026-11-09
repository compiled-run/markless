import { computed, state } from '@markless/core';
import { answer } from './gates.ts';

const fruit = ['apple', 'apricot', 'banana', 'grape'];

export function Narrow() @{
	let typed = state('');
	let asked = state('');
	const found = computed(async () => answer(`found:${asked}`, fruit.filter((name) => name.includes(asked))));
	const visible = computed(() => found.filter((name) => name.includes(typed)).join(','));

	<div>
		<input data-box value={typed} onInput={(event) => {
			typed = event.currentTarget.value;
			asked = event.currentTarget.value;
		}} />
		@try {
			<p data-visible>{visible}</p>
		} @pending {
			<p>Finding</p>
		}
	</div>
}
