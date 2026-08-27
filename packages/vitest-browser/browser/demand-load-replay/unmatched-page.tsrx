import { state } from '@markless/core';

// Rows carry a `click` record, so the container listens for `click` on behalf
// of rows that may not exist yet and forwards EVERY click, including ones on
// plain elements no record names. What the runtime does with such a forward is
// what these rows measure.
export default function DemandLoadReplayUnmatchedPage() @{
	let items = state([{ id: 'a', label: 'alpha' }]);
	let picked = state('none');
	let enters = state(0);

	<section data-dlr-unmatched>
		<p data-testid="unmatched-plain">No record names this</p>
		<div
			data-testid="unmatched-hover"
			onPointerenter={() => {
				enters = enters + 1;
			}}
		>
			<span data-testid="unmatched-hover-label">Hover me</span>
		</div>
		<ul data-testid="unmatched-list">
			@for (const item of items; key item.id) {
				<li data-testid="unmatched-row" onClick={() => picked = item.label}>{item.label}</li>
			}
		</ul>
		<output data-testid="unmatched-picked">{picked}</output>
		<output data-testid="unmatched-enters">{enters}</output>
	</section>
}
