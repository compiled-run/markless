import { element, state } from '@markless/core';
import { checkbox } from '../../src/index.ts';

// A consumer hangs their own handler, their own extra event, and their own
// element handle on a library part. This pins what actually reaches the DOM.
export function App() @{
	let clicks = state(0);
	let hovers = state(0);
	let consumerTag = state('none');
	const consumerEl = element<HTMLButtonElement>();

	<section data-testid="part-props">
		<div data-case="handler">
			<checkbox.root>
				<checkbox.trigger onClick={() => { clicks = clicks + 1; }}>
					<checkbox.indicator>Checked</checkbox.indicator>
				</checkbox.trigger>
			</checkbox.root>
		</div>
		<div data-case="bare">
			<checkbox.root>
				<checkbox.trigger>
					<checkbox.indicator>Checked</checkbox.indicator>
				</checkbox.trigger>
			</checkbox.root>
		</div>
		<div data-case="spread">
			<checkbox.root>
				<checkbox.trigger onMouseEnter={() => { hovers = hovers + 1; }}>
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
		<button type="button" data-probe-handle onClick={() => { consumerTag = consumerEl ? consumerEl.tagName : 'none'; }}>Read handle</button>
		<output data-probe="clicks">{clicks}</output>
		<output data-probe="hovers">{hovers}</output>
		<output data-probe="consumer-tag">{consumerTag}</output>
	</section>
}
