import { state } from '@markless/core';

// A focusable host whose only record is a click: focus must fetch nothing.
export default function FocusPrimedKeylessPage() @{
	let clicks = state(0);

	<section data-focus-primed-keyless-page>
		<button
			data-testid="keyless-host"
			onClick={() => {
				clicks = clicks + 1;
			}}
		>
			Click only
		</button>
		<output data-testid="clicks">{clicks}</output>
	</section>
}
