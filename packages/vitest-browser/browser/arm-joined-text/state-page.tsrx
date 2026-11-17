import { state } from '@markless/core';

export default function StateJoinedArmPage() @{
	let step = state(1);
	let open = state(true);

	<div>
		<button type="button" data-step onClick={() => step++}>
			step
		</button>
		<button type="button" data-open onClick={() => (open = !open)}>
			toggle
		</button>
		@if (open) {
			<span data-pair>{step * 10} of {step + 2} done</span>
		}
	</div>
}
