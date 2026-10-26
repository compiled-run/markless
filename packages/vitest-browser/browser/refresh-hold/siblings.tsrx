import { computed, state } from '@markless/core';

export function App() @{
	let left = state('a');
	let right = state('x');
	const leftValue = computed(async () => {
		const at = left;
		await new Promise((resolve) => setTimeout(resolve, at === 'a' ? 10 : 600));
		return { text: 'Left ' + at };
	});
	const rightValue = computed(async () => {
		const at = right;
		await new Promise((resolve) => setTimeout(resolve, 10));
		return { text: 'Right ' + at };
	});

	<main>
		<button type="button" data-left onClick={() => (left = 'b')}>Left</button>
		<div data-pair>
			@try {
				<span data-left-value>{leftValue.text}</span>
			} @pending {
				<span data-pending>Loading left</span>
			} @catch {
				<span data-failed>Left broken</span>
			}
			@try {
				<span data-right-value>{rightValue.text}</span>
			} @pending {
				<span data-pending>Loading right</span>
			} @catch {
				<span data-failed>Right broken</span>
			}
		</div>
	</main>
}
