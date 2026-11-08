import { computed, state } from '@markless/core';

const FRUIT = ['Pear', 'Plum', 'Lime', 'Lychee'];

// Answers within the task that asked, like a lookup served from a cache.
async function lookUp(start: string) {
	await 0;
	return FRUIT.filter((name) => name.toLowerCase().startsWith(start.toLowerCase()));
}

export default function CachedPicker() @{
	let open = state(false);
	let start = state('');
	let picked = state('none');
	const fruit = computed(async () => await lookUp(start));
	<div>
		<button type="button" data-open onClick={() => open = !open}>Pick</button>
		<input data-query value={start} onInput={(event) => start = event.currentTarget.value} />
		<output data-picked>{picked}</output>
		@if (open) {
			@try {
				<ul>
					@for (const name of fruit; key name) {
						<li data-result onClick={() => picked = name}>{name}</li>
					}
				</ul>
			} @pending {
				<p data-loading>Loading</p>
			}
		}
	</div>
}
