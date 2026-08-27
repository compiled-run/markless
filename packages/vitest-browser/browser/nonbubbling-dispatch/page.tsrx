import { state } from '@markless/core';

// One `pointerenter` handler on the list, plain descendants under it. The
// container's capture listener is handed each descendant's own non-bubbling
// event, so a hovered option must be silent rather than an unmatched dispatch.
export default function NonBubblingDispatchPage() @{
	let entries = state(0);
	let chosen = state('none');

	<section data-nbd-page>
		<p data-testid="background">Outside the list</p>
		<div
			data-testid="list"
			role="listbox"
			onPointerenter={() => {
				entries = entries + 1;
			}}
		>
			<div data-testid="option-alpha" role="option" onClick={() => {
				chosen = 'alpha';
			}}>
				<span data-testid="label-alpha">Alpha</span>
			</div>
			<div data-testid="option-beta" role="option">
				<span data-testid="label-beta">Beta</span>
			</div>
		</div>
		<output data-testid="entries">{entries}</output>
		<output data-testid="chosen">{chosen}</output>
	</section>
}
