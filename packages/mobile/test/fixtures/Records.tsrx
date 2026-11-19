import { state } from '@markless/core';

const LABELS: Record<string, string> = { on: 'Running', off: 'Stopped', '1': 'One' };

export default function Records() @{
	let mode = state<string | number>('off');
	<main>
		<p>{LABELS[mode]}</p>
		<button onClick={() => (mode = 'on')}>Start</button>
		<button onClick={() => (mode = 1)}>Number</button>
		<button onClick={() => (mode = 'gone')}>Unknown</button>
	</main>
}
