import { state } from '@markless/core';

// Field mirrors the radio-group item shape: a part that spreads consumer props
// onto its own element, destructures the same event name it also handles, and
// guards preventDefault by event fields alone. The guarded call is
// browser-critical, so it has to be cancelled at capture, before the handler
// symbol has loaded.
export function Field({ onKeydown, ...rest }) @{
	let moves = state(0);

	<span data-field-wrap>
		<input
			{...rest}
			type="text"
			data-field
			onKeydown={(event) => {
				if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
					event.preventDefault();
				}
				moves++;
			}}
		/>
		<output data-field-moves>{moves}</output>
	</span>
}

export function App() @{
	<main data-keydown-prevent-default>
		<Field data-role="composed" />
	</main>
}
