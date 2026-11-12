import { computed, state } from '@markless/core';

type Todo = { id: string; text: string };

// A sync computed over the async value this component got as a prop, and a state it writes.
export default function TailList({ todos }: { todos: Array<Todo> }) @{
	let drafts = state<Array<Todo>>([]);
	const saved = computed(() => todos.filter((todo) => !drafts.some((draft) => draft.id === todo.id)));

	<div>
		<button data-add onClick={() => (drafts = [...drafts, { id: `d${drafts.length}`, text: `z${drafts.length}` }])}>add</button>
		<button data-claim onClick={() => (drafts = [...drafts, { id: 'a', text: 'mine' }])}>claim</button>
		<ul>
			@for (const todo of saved; key todo.id) {
				<li>{todo.text}</li>
			}
			@for (const draft of drafts; key draft.id) {
				<li>{draft.text}</li>
			}
		</ul>
	</div>
}
