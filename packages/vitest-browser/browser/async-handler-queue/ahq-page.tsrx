import { state } from '@markless/core';

const held = (): Promise<void> =>
	new Promise((resolve) => {
		(globalThis as { __finishSlow?: () => void }).__finishSlow = resolve;
	});

export default function AsyncHandlerPage() @{
	let slow = state('idle');
	let quick = state(0);
	<section>
		<button
			type="button"
			data-slow
			onClick={async () => {
				slow = 'waiting';
				await held();
				slow = 'done';
			}}
		>
			slow
		</button>
		<button type="button" data-quick onClick={() => (quick = quick + 1)}>
			quick
		</button>
		<output data-slow-state>{slow}</output>
		<output data-quick-count>{quick}</output>
	</section>
}
