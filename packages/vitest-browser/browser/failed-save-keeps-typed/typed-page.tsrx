import { computed } from '@markless/core';
import { loadPerson, save } from './api.ts';

export function TypedPage() @{
	const person = computed(async () => loadPerson('a1'));
	<main>
		@try {
			<form
				onSubmit={async (event) => {
					event.preventDefault();
					await save();
				}}
			>
				<input name="first" value={person.first} />
				<button type="submit" data-submit>Save</button>
			</form>
		} @catch (error) {
			<p data-caught>{error.message}</p>
		}
	</main>
}
