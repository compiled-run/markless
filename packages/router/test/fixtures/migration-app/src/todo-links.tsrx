import { computed, state } from '@markless/core';
import { Link } from '@markless/router';

function TodoLink({ id, title }: { readonly id: string; readonly title: string }) @{
	<Link href="/todos/[id]" params={{ id }} data-todo-link>{title}</Link>
}

export default function TodoLinks() @{
	let count = state(2);
	const todos = computed(async () =>
		['a', 'b', 'c'].slice(0, count).map((id) => ({ id, title: `Todo ${id}` })),
	);

	<section>
		<button type="button" data-more-todos onClick={() => count++}>More</button>
		@try {
			<ul>
				@for (const todo of todos; key todo.id) {
					<li><TodoLink id={todo.id} title={todo.title} /></li>
				}
			</ul>
		} @pending {
			<p>loading todos</p>
		}
	</section>
}
