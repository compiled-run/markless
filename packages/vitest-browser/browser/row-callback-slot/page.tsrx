import { state } from '@markless/core';
import { collapsible } from '../../../headless/components/src/index.ts';

export default function RowCallbackSlotPage() @{
	let rows = state([{ id: 'milk' }, { id: 'bread' }]);
	let opened = state(0);
	let last = state('none');
	<main>
		@for (const row of rows; key row.id) {
			<collapsible.root onChange={(open) => {
				opened = open ? opened + 1 : opened - 1;
				last = row.id + ':' + open;
			}}>
				<collapsible.trigger data-trigger={row.id}>{row.id}</collapsible.trigger>
				<collapsible.content>body</collapsible.content>
			</collapsible.root>
		}
		<p data-opened>{opened}</p>
		<p data-last>{last}</p>
	</main>
}
