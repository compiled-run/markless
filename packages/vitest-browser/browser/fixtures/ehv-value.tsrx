import { element } from '@markless/core';
import { markOpened } from './ehv-focus.ts';

// Shape 3: the handle is passed as a VALUE into an imported plain function,
// which does the observable DOM work.
export default function EhvValuePage() @{
	const panel = element<HTMLDivElement>();

	<div data-ehv-value-root>
		<div data-ehv-value-panel el={panel}>panel</div>
		<button type="button" data-ehv-value-trigger onClick={() => {
			markOpened(panel, 'yes');
		}}>open</button>
	</div>
}
