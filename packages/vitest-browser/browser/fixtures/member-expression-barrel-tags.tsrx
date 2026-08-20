import { state } from '@markless/core';
import { checkbox } from './ui.ts';

export function App() @{
	let checked = state('off');

	<section>
		<checkbox.root checked={checked}>
			<p class="checkbox-label">Subscribe</p>
			<checkbox.trigger onToggle={() => checked = 'on'} />
		</checkbox.root>
	</section>
}
