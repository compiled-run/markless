import { computed, state } from '@markless/core';
import type { PageProps } from '@markless/router';
import { answerSoon } from '../src/answer-soon.ts';

export default function PropSeededRecipe({ url }: PageProps) @{
	let where = state(url.pathname);
	let version = state(0);
	const data = computed(async () => {
		const v = version;
		return answerSoon({ text: `v${v} ${where}` });
	});
	<main>
		<button type="button" data-bump onClick={() => version++}>bump</button>
		@try {
			<p data-seeded>{data.text}</p>
		} @pending {
			<p>pending</p>
		} @catch (error) {
			<p>{'caught ' + String(error)}</p>
		}
	</main>
}
