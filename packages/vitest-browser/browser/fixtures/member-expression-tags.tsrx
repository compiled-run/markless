import { state } from '@markless/core';
import * as checkbox from './checkbox/index.ts';

export function App() @{
	let checked = state('off');

	<main>
		<checkbox.root checked={checked}>
			<p class="checkbox-label">Subscribe</p>
			<checkbox.trigger onToggle={() => checked = 'on'} />
		</checkbox.root>
	</main>
}
