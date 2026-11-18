import { computed, state } from '@markless/core';

const FRUIT = ['Fig', 'Grape', 'Guava', 'Kiwi'];

async function lookUp(start: string) {
	await new Promise((resolve) => setTimeout(resolve, 150));
	return FRUIT.filter((name) => name.toLowerCase().startsWith(start.toLowerCase()));
}

export default function PickSearch() @{
	let open = state(false);
	let start = state('');
	let picked = state('none');
	const fruit = computed(async () => await lookUp(start));
	<div>
		<button type="button" data-open onClick={() => open = !open}>Pick</button>
		<input data-query value={start} onInput={(event) => start = event.currentTarget.value} />
		<output data-picked>{picked}</output>
		@if (open) {
			<div data-list>
				@try {
					<ul>
						@for (const name of fruit; key name) {
							<li data-result onClick={() => picked = name}>{name}</li>
						}
					</ul>
				} @pending {
					<p data-loading>Loading</p>
				}
			</div>
		}
	</div>
}
