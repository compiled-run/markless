import { state } from '@markless/core';

// One handler per gesture, each on a host with a plain descendant under it, so
// the container's single capture listener is handed both the host's own event
// and the descendant's. Every counter is a per-element dispatch count.
export default function DemandLoadReplayPage() @{
	let enters = state(0);
	let clicks = state(0);
	let keys = state(0);

	<section data-dlr-page>
		<p data-testid="background">Outside the hosts</p>
		<div
			data-testid="hover-host"
			onPointerenter={() => {
				enters = enters + 1;
			}}
		>
			<span data-testid="hover-label">Hover me</span>
		</div>
		<button
			data-testid="click-host"
			onClick={() => {
				clicks = clicks + 1;
			}}
		>
			<span data-testid="click-label">Click me</span>
		</button>
		<input
			data-testid="key-host"
			onKeydown={() => {
				keys = keys + 1;
			}}
		/>
		<output data-testid="enters">{enters}</output>
		<output data-testid="clicks">{clicks}</output>
		<output data-testid="keys">{keys}</output>
	</section>
}
