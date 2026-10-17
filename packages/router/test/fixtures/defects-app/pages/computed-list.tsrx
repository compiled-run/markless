import { computed, state } from '@markless/core';
import { matching, PEOPLE } from '../src/people.ts';
import { PersonItem } from '../src/person-item.tsrx';

export default function ComputedListPage() @{
	let needle = state('');
	const shown = computed(() => matching(PEOPLE, needle));
	<main>
		<input data-needle onInput={(event) => (needle = (event.target as HTMLInputElement).value)} />
		<ul data-plain>
			@for (const person of shown; key person.id) {
				<li data-id={person.id}>{person.name}</li>;
			}
		</ul>
		<ul data-components>
			@for (const person of shown; key person.id) {
				<PersonItem person={person} />;
			}
		</ul>
	</main>;
}
