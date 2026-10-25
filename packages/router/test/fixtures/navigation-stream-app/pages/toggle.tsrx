import { computed, state } from '@markless/core';
import { slow } from '../src/slow.ts';

export default function Toggle() @{
	let open = state(false);
	let clicks = state(0);
	let wakes = state(0);
	const data = computed(async () => slow('toggle'));

	<main data-page="toggle">
		<button data-wake onClick={() => wakes++}>{`woke ${wakes}`}</button>
		@try {
			<div>
				<p data-answer>{data.text}</p>
				<a data-open href="/toggle?open=true" onClick={(event) => {
					event.preventDefault();
					open = !open;
				}}>{open ? 'Close' : 'Open'}</a>
				<button data-count onClick={() => clicks++}>{`clicked ${clicks}`}</button>
				<div data-panel hidden={!open}>panel</div>
			</div>
		} @pending {
			<p data-pending>pending</p>
		}
	</main>
}
