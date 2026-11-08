import { computed, state } from '@markless/core';

const FRUIT = ['Fig', 'Grape', 'Guava', 'Kiwi', 'Lime', 'Mango'];

async function lookUp(start: string) {
	await new Promise((resolve) => setTimeout(resolve, 2));
	if (start === 'x') throw new Error('No match');
	return FRUIT.filter((name) => name.toLowerCase().startsWith(start.toLowerCase()));
}

export default function Finder() @{
	let start = state('');
	let picked = state('none');
	const fruit = computed(async () => await lookUp(start));
	<div>
		<input data-query value={start} onInput={(event) => start = event.currentTarget.value} />
		<output data-picked>{picked}</output>
		<ul data-list>
			@try {
				@for (const name of fruit; key name) {
					<li data-result onClick={() => picked = name}>{name}</li>
				}
			} @pending {
				<li data-loading>Loading</li>
			} @catch {
				<li data-failed>Failed</li>
			}
		</ul>
	</div>
}
