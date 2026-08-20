import { element, state } from '@markless/core';
import { checkbox } from '../../src/index.ts';

// A consumer hangs their own handler on a library part. Event handlers never ride
// `{...rest}`, so this pins what actually reaches the DOM.
export function App() @{
	let clicks = state(0);
	const consumerEl = element<HTMLButtonElement>();

	<section data-testid="part-props">
		<div data-case="handler">
			<checkbox.root>
				<checkbox.trigger onClick={() => { clicks = clicks + 1; }}>
					<checkbox.indicator>Checked</checkbox.indicator>
				</checkbox.trigger>
			</checkbox.root>
		</div>
		<div data-case="handle">
			<checkbox.root>
				<checkbox.trigger el={consumerEl}>
					<checkbox.indicator>Checked</checkbox.indicator>
				</checkbox.trigger>
			</checkbox.root>
		</div>
		<output data-probe="clicks">{clicks}</output>
	</section>
}
