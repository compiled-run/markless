import { state } from '@markless/core';
import { IcItem, IcRoot } from './ic-widget.tsrx';

// The same three items, written once through a keyed repeat. A key is row
// identity, not row position: the family's answer has to be the same either way.
export default function IcKeyedPage() @{
	let rows = state([{ id: 'alpha' }, { id: 'bravo' }, { id: 'charlie' }]);

	<section data-ic-page>
		<IcRoot>
			<div data-ic-rows>
				@for (const row of rows; key row.id) {
					<IcItem>{row.id}</IcItem>
				}
			</div>
		</IcRoot>
	</section>
}
