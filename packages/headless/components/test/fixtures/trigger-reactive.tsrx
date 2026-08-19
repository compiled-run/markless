import { state } from '@markless/core';
import { checkbox } from '../../src/index.ts';

export function App() @{
	let blocked = state(false);

	<section data-testid="trigger-reactive">
		<button type="button" data-flip onClick={() => blocked = !blocked}>flip</button>
		<checkbox.root>
			<checkbox.trigger disabled={blocked}>x</checkbox.trigger>
		</checkbox.root>
	</section>
}
