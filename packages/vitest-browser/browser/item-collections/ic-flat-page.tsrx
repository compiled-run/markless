import { state } from '@markless/core';
import { IcItem, IcRoot } from './ic-widget.tsrx';

// Items written FLAT: siblings in the consumer's own markup, no keyed repeat.
// That is how a consumer writes `tour` and `otp`, and it is the case a
// component-local element() handle id could not tell apart - two flat parts of
// one family stand in the same (empty) row and file under one bare key.
//
// The repeat between them only moves the collection after resume: the flat
// `omega` behind it has to renumber, and the second instance's flat pair has to
// go on answering its own two places while that happens.
export default function IcFlatPage() @{
	let rows = state([{ id: 'bravo' }]);

	<section data-ic-page>
		<div data-ic-first>
			<IcRoot>
				<IcItem>alpha</IcItem>
				<div data-ic-rows>
					@for (const row of rows; key row.id) {
						<IcItem>{row.id}</IcItem>
					}
				</div>
				<IcItem>omega</IcItem>
			</IcRoot>
		</div>
		<div data-ic-second>
			<IcRoot>
				<IcItem>charlie</IcItem>
				<IcItem>delta</IcItem>
			</IcRoot>
		</div>
		<button
			type="button"
			data-ic-flat-add
			onClick={() => {
				rows = [...rows, { id: `row-${rows.length}` }];
			}}
		>add</button>
		<button
			type="button"
			data-ic-flat-drop
			onClick={() => {
				rows = rows.slice(1);
			}}
		>drop</button>
	</section>
}
