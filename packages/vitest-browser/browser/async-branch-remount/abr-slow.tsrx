import { computed, state } from '@markless/core';

async function lookUp(word: string) {
	await new Promise((resolve) => setTimeout(resolve, 300));
	return [`${word} one`, `${word} two`];
}

export default function SlowPicker() @{
	let picking = state(false);
	let word = state('plain');
	const options = computed(async () => await lookUp(word));
	<form>
		<button type="button" data-pick onClick={() => picking = !picking}>Pick</button>
		<button type="button" data-word onClick={() => word = 'fancy'}>Fancy</button>
		@if (picking) {
			<menu data-options>
				@try {
					@for (const option of options; key option) {
						<li data-option>{option}</li>
					}
				} @pending {
					<li data-wait>Wait</li>
				}
			</menu>
		}
	</form>
}
