import { state } from '@markless/core';
import { checkbox } from '../../../headless/components/src/index.ts';

// One docs-style card: a widget at the same component position in every island.
export function Card() @{
	let ticked = state(false);

	<article data-card>
		<checkbox.root checked={ticked} onChange={(next) => (ticked = next === true)}>
			<checkbox.trigger data-trigger>
				<checkbox.indicator>on</checkbox.indicator>
			</checkbox.trigger>
			<checkbox.label data-label>Agree</checkbox.label>
			<checkbox.description data-description>Hint</checkbox.description>
		</checkbox.root>
		<output data-value>{ticked ? 'true' : 'false'}</output>
	</article>
}
