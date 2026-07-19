import { computed, state } from '@markless/core';

export function App() @{
	let lot = state(4);
	const checkpoint = computed(async () => {
		await new Promise((resolve) => setTimeout(resolve, 8));
		return { verdict: 'Checkpoint open' };
	});
	const consignment = computed(async ({ signal }) => {
		const ticket = lot;
		await new Promise((resolve) => setTimeout(resolve, 18));
		if (signal.aborted) return { dispatch: { sequence: 'aborted' } };
		return { dispatch: { sequence: 'lot-' + ticket } };
	});
	const docket = computed(async ({ signal }) => {
		const sequence = consignment.dispatch.sequence;
		await new Promise((resolve) => setTimeout(resolve, 38));
		if (signal.aborted) return { notice: 'aborted' };
		return { notice: 'Manifest ' + sequence };
	});

	<address>
		<button type="button" data-advance-lot onClick={() => lot += 3}>Advance lot</button>
		<header>
			@try {
				<em data-checkpoint-arm>{checkpoint.verdict}</em>
			} @pending {
				<em data-checkpoint-arm>Inspecting checkpoint</em>
			} @catch {
				<em data-checkpoint-arm>Checkpoint closed</em>
			}
		</header>
		<footer>
			@try {
				<time data-docket-arm>{docket.notice}</time>
			} @pending {
				<time data-docket-arm>Sorting consignment</time>
			} @catch {
				<time data-docket-arm>Dispatch refused</time>
			}
		</footer>
	</address>
}
