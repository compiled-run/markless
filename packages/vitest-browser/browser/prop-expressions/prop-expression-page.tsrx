import { state } from '@markless/core';
import Gauge, { Formatted, Switch } from './prop-expression-child.tsrx';

export default function PropExpressions() @{
	let mode = state('h');
	let level = state(1);
	let dark = state(false);
	<main>
		<Gauge mode={mode} level={level} />
		<Gauge level={2} />
		<Formatted formatter={{ format: (value: number) => `#${value}` }} n={level} />
		<Switch tone={dark ? 'dark' : 'light'} pressed={dark} />
		<button data-flip onClick={() => { mode = 'v'; level++; dark = true; }}>flip</button>
	</main>
}
