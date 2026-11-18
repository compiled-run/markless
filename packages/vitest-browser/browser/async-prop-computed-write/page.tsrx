import { computed } from '@markless/core';
import TailList from './tail-list.tsrx';

export default function Page() @{
	const todos = computed(async () => [
		{ id: 'a', text: 'x' },
		{ id: 'b', text: 'y' },
	]);

	<main>
		@try {
			<TailList todos={todos} />
		} @pending {
			<p data-loading>loading</p>
		}
	</main>
}
