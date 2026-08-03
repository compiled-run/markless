import { state } from '@markless/core';

function BranchPanel({ active }) @{
	<section aria-label="Same-module child branch">
		@if (active) {
			<p data-child-arm>Active arm</p>
		} @else {
			<p data-child-arm>Quiet arm</p>
		}
	</section>
}

export function App() @{
	let active = state(false);

	<main>
		<h1>Same-module branch range</h1>
		<button type="button" data-toggle-branch onClick={() => active = !active}>
			Flip child branch
		</button>
		<p data-sibling-before>Before child range</p>
		<BranchPanel active={active} />
		<p data-sibling-after>After child range</p>
	</main>
}
