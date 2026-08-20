import { state } from '@markless/core';

function Message() @{
	<em>armed</em>
}

// Two components with the same shape. The only difference is what the arm holds:
// a plain element on the left, a component reference on the right.
export function App() @{
	let elementClicks = state(0);
	let elementArmed = state(false);
	let componentClicks = state(0);
	let componentArmed = state(false);

	<section data-testid="arm-component-handler">
		<div data-case="element-arm">
			<button type="button" onClick={() => { elementClicks = elementClicks + 1; elementArmed = true; }}>
				Arm
			</button>
			<output>{elementClicks}</output>
			@if (elementArmed) { <em>armed</em> }
		</div>
		<div data-case="component-arm">
			<button type="button" onClick={() => { componentClicks = componentClicks + 1; componentArmed = true; }}>
				Arm
			</button>
			<output>{componentClicks}</output>
			@if (componentArmed) { <Message /> }
		</div>
	</section>
}
