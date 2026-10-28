import { computed, state } from '@markless/core';

const words = ['zinc', 'zod', 'zero', 'button'];

export default function MovedField() @{
	let query = state('');
	const results = computed(async () => {
		const wanted = query;
		await Promise.resolve();
		return wanted ? words.filter((word) => word.includes(wanted)) : [];
	});
	<div>
		<input data-query type="text" value="" onInput={(event) => (query = (event.target as HTMLInputElement).value)} />
		@try {
			<ul>
				@for (const word of results; key word) {
					<li data-value={word}>{word}</li>
				}
			</ul>
		} @catch {
		}
	</div>
}
