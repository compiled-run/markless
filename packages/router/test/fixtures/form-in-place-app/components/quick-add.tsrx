import { computed } from '@markless/core';
import { loadTodos } from '../src/todos.ts';

// A component with its own @try, rendered several times on one page.
export function QuickAdd({ name }: { readonly name: string }) @{
	const todos = computed(async () => await loadTodos());

	@try {
		<section data-quick={name}>
			<form method="post" action="/api/todos" data-quick-form>
				<input name="title" data-quick-title aria-label={`Quick ${name}`} />
				<button type="submit" data-quick-submit>Add</button>
			</form>
			<p data-quick-count>{todos.length}</p>
		</section>
	} @pending {
		<p>Loading</p>
	} @catch (error) {
		<p data-quick-error>{error.message}</p>
	}
}
