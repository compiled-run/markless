import { computed, state } from '@markless/core';
import { fetchRows } from './fetch-rows.ts';

export default function SpreadAsync() @{
	let copied = state('');
	const todo = computed(async () => (await fetchRows('todo'))[0]);

	<main>
		@try {
			<div>
				<p data-text>{todo.text}</p>
				<button data-copy onClick={() => (copied = JSON.stringify({ ...todo }))}>Copy</button>
			</div>
		} @pending {
			<p>loading</p>
		}
		<output>{copied}</output>
	</main>
}
