import { state } from '@markless/core';
import { base } from '../../index.ts';

// Toggle buttons next to a plain one. The handler writes into page state the page
// renders, so what the DOM shows is what the consumer's callback was called with
// and how often. The parts take a closed prop list, so each button is found by its
// accessible name rather than by a test id of its own.
export default function ToggleButtons() @{
	const log = state({ value: '', calls: 0 });

	<div>
		<base.button
			pressed={false}
			onChange={(next: boolean) => {
				log.value = String(next);
				log.calls = log.calls + 1;
			}}
		>Mute</base.button>
		<base.button pressed>Bold</base.button>
		<base.button disabled pressed={false}>Locked</base.button>
		<base.button>Plain</base.button>
		<p data-testid="value">{log.value}</p>
		<p data-testid="calls">{log.calls}</p>
	</div>
}
