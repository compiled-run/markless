import { computed, state } from '@markless/core';
import { answer } from './gates.ts';

function Step({ at, of, onStep }: { at: number; of: number; onStep: () => void }) @{
	<button type="button" data-child onClick={onStep}>{`Step ${at} / ${of}`}</button>
}

export function PagerShapes() @{
	let sheet = state(1);
	const sheets = computed(async () => answer(`sheets:${sheet}`, { count: 4, jumps: [1, 2, 3] }));

	<main>
		@try {
			<section>
				<button type="button" data-nested onClick={() => (sheet = sheet + 1)}>
					<span data-nested-label>Sheet {sheet} of {sheets.count}</span>
				</button>
				<ul>
					@for (const jump of sheets.jumps; key jump) {
						<li>
							<button type="button" data-jump onClick={() => (sheet = jump)}>Go {jump}, at {sheet} of {sheets.count}</button>
						</li>
					}
				</ul>
				<Step at={sheet} of={sheets.count} onStep={() => (sheet = sheet + 1)} />
				<b data-shown>{sheets.count + sheet}</b>
			</section>
		} @pending {
			<p>Loading</p>
		}
	</main>
}
