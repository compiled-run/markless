import { computed, shared, state } from '@markless/core';
import { slow } from '../src/slow.ts';

const counter = shared(
	() => {
		const box = state({ version: 0 });
		return { ...box };
	},
	{ scope: 'page' },
);

export default function SharedAsyncPage() @{
	const c = counter();
	const data = computed(async () => {
		const v = c.version;
		return slow(`v${v}`, 100);
	});

	<main>
		<button data-bump onClick={() => c.version++}>bump</button>
		@try {
			<p data-text>{data.text}</p>
		} @pending {
			<p data-pending>pending</p>
		} @catch (error) {
			<p data-caught>{'caught ' + String(error)}</p>
		}
	</main>
}
