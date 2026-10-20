import { state } from '@markless/core';

export default function PortalMovePage() @{
	let open = state(false);
	let presses = state(0);
	let afters = state(0);
	<main>
		<section data-old>
			<p data-before>{presses}</p>
			<div data-dialog data-state={open ? 'open' : 'closed'}>
				<h2 data-title>{open ? 'Open dialog' : 'Closed dialog'}</h2>
				<button data-dialog-press onClick={() => presses++}>{presses}</button>
			</div>
			<button data-after-press onClick={() => afters++}>{afters}</button>
		</section>
		<button data-toggle onClick={() => (open = !open)}>{open ? 'on' : 'off'}</button>
	</main>;
}
