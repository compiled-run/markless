import { state } from '@markless/core';

// Not measured. Rendering and pressing this once puts the resume runtime and its
// dispatch modules in the browser - which is where every row in this file starts
// under the project's normal load, where earlier files have already fetched
// them. What a measured row then pays for is its own handler symbols, which is
// what a preload can still save.
export default function ColdTriggerWarmupPage() @{
	let value = state(0);

	<aside data-cold-trigger="warmup">
		<button
			data-testid="warmup-step"
			onPointerdown={() => {
				value = value + 1;
			}}
			onPointerup={() => {
				value = value + 1;
			}}
			onPointerleave={() => {
				value = value + 1;
			}}
			onClick={() => {
				value = value + 1;
			}}
		>
			Warm
		</button>
		<output data-testid="warmup-value">{value}</output>
	</aside>
}
