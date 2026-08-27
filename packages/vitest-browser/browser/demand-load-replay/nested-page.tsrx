import { state } from '@markless/core';

// The deep shape: the container answers the gesture and the element the pointer
// or the key actually reaches is two levels below it, so the container's one
// capture listener is handed the same gesture once per element on the way down.
export default function DemandLoadReplayNestedPage() @{
	let enters = state(0);
	let clicks = state(0);
	let keys = state(0);

	<section data-dlr-nested>
		<p data-testid="nested-background">Outside the list</p>
		<div
			data-testid="nested-list"
			role="listbox"
			tabindex="0"
			onPointerenter={() => {
				enters = enters + 1;
			}}
			onKeydown={() => {
				keys = keys + 1;
			}}
		>
			<div
				data-testid="nested-option"
				role="option"
				onClick={() => {
					clicks = clicks + 1;
				}}
			>
				<span data-testid="nested-label">Alpha</span>
			</div>
			<div data-testid="nested-option-beta" role="option">
				<span data-testid="nested-label-beta">Beta</span>
			</div>
		</div>
		<output data-testid="nested-enters">{enters}</output>
		<output data-testid="nested-clicks">{clicks}</output>
		<output data-testid="nested-keys">{keys}</output>
	</section>
}
