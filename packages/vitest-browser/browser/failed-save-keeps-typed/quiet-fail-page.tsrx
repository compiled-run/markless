import { computed, state } from '@markless/core';
import { loadPerson } from './api.ts';

export function QuietFailPage() @{
	let note = state('');
	const person = computed(async () => loadPerson('b2'));
	<main>
		@try {
			<form
				onSubmit={async (event) => {
					event.preventDefault();
					note = 'sending';
					const response = await fetch('/fst/save', { method: 'POST' });
					note = response.ok ? 'saved' : 'refused';
				}}
			>
				<input name="first" value={person.first} />
				<p data-note>{note}</p>
				<button type="submit" data-submit>Save</button>
			</form>
		} @catch (error) {
			<p data-caught>{error.message}</p>
		}
	</main>
}
