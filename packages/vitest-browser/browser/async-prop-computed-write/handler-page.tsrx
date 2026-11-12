import { computed } from '@markless/core';
import HandlerList from './handler-list.tsrx';

export default function HandlerPage() @{
	const todos = computed(async () => [
		{ id: 'a', text: 'x' },
		{ id: 'b', text: 'y' },
	]);

	<main>
		@try {
			<HandlerList todos={todos} />
		} @pending {
			<p data-loading>loading</p>
		}
	</main>
}
