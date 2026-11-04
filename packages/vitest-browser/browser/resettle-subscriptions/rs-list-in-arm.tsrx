import { computed, state } from '@markless/core';

const BIRDS = ['Crow', 'Crane', 'Dove', 'Finch', 'Heron', 'Wren'];

async function sight(prefix: string) {
	await new Promise((resolve) => setTimeout(resolve, 2));
	if (prefix === 'x') throw new Error('No bird');
	return BIRDS.filter((name) => name.toLowerCase().startsWith(prefix.toLowerCase()));
}

export default function Aviary() @{
	let shown = state(false);
	let prefix = state('');
	let spotted = state('none');
	const birds = computed(async () => await sight(prefix));
	<article>
		<button type="button" data-open onClick={() => shown = !shown}>Birds</button>
		<input data-query value={prefix} onInput={(event) => prefix = event.currentTarget.value} />
		<output data-picked>{spotted}</output>
		@if (shown) {
			@try {
				<ol data-list>
					@for (const name of birds; key name) {
						<li data-result onClick={() => spotted = name}>{name}</li>
					}
				</ol>
			} @pending {
				<p data-loading>Loading</p>
			} @catch {
				<p data-failed>Failed</p>
			}
		}
	</article>
}
