import { state } from '@markless/core';
import { IcItem, IcRoot } from './ic-widget.tsrx';

// Items that arrive and leave after the page has resumed. A position is a place
// in the collection as it stands, so removing the first item has to renumber
// everything behind it - which an authored index never does.
export default function IcMutatingPage() @{
	let rows = state([{ id: 'alpha' }, { id: 'bravo' }, { id: 'charlie' }]);

	<section data-ic-page>
		<IcRoot>
			<div data-ic-rows>
				@for (const row of rows; key row.id) {
					<IcItem>{row.id}</IcItem>
				}
			</div>
		</IcRoot>
		<button
			type="button"
			data-ic-add
			onClick={() => {
				rows = [...rows, { id: `delta-${rows.length}` }];
			}}
		>add</button>
		<button
			type="button"
			data-ic-drop-first
			onClick={() => {
				rows = rows.slice(1);
			}}
		>drop first</button>
	</section>
}
