import { state } from '@markless/core';

export function App() @{
	let seen = state('no');

	<section>
		<div data-visible-host onVisible={() => { seen = 'yes'; }}>Visible</div>
		<div data-attach-host attach={(element) => { element.setAttribute('data-attached', 'yes'); }}>Attached</div>
		<div data-attach-on-sight attach={(element) => { element.setAttribute('data-attached', 'yes'); }} onVisible={() => {}}>On sight</div>
		<output data-seen>{seen}</output>
	</section>
}
