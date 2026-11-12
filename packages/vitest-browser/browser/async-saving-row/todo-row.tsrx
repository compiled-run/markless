import { state } from '@markless/core';
import type { Todo } from './save.ts';

export default function TodoRow({ todo }: { todo: Todo }) @{
	let open = state(false);

	<li>
		<button data-more onClick={() => (open = !open)}>{todo.text}</button>
		@if (open) {
			<span data-saving>Notes for {todo.text}</span>
		}
	</li>
}
