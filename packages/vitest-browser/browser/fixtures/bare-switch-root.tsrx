import { state } from '@markless/core';

export default function BareSwitchRoot({ initial = 'a' }: { initial?: string }) @{
	let view = state(initial);

	@switch (view) {
		@case 'a': {
			<main data-view="a">
				<button type="button" data-next onClick={() => (view = 'b')}>to b</button>
			</main>
		}
		@default: {
			<main data-view="other">
				<button type="button" data-next onClick={() => (view = 'a')}>to a</button>
			</main>
		}
	}
}
