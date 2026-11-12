import { state } from '@markless/core';

export default function HandlerList({ todos }: { todos: Array<{ id: string; text: string }> }) @{
	let picked = state('');
	<div>
		<button data-pick onClick={() => (picked = todos.map((todo) => todo.text).join(','))}>pick</button>
		<span data-picked>{picked}</span>
	</div>
}
