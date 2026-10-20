import { state } from '@markless/core';

export default function NoscriptPage() @{
	let clicks = state(0);

	<section>
		<noscript>
			<div class="warning">
				<strong>Turn on JavaScript</strong>
				<a href="/help">help</a>
			</div>
		</noscript>
		<h2>after</h2>
		<button type="button" data-bump onClick={() => clicks++}>{clicks}</button>
	</section>
}
