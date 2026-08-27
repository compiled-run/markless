import {
	KrgrAdd,
	KrgrItem,
	KrgrItemDrop,
	KrgrLength,
	KrgrRoot,
	KrgrRowDrop,
	krgrStore,
} from './krgr-family.tsrx';

// One widget-scoped collection feeds two lists - plain rows, and rows that each
// root a widget - so anything only the component rows show is attributable to the
// row root. Three keys are served and a fourth is only ever minted, so a served
// row and a minted row of the same shape sit side by side.
export default function KrgrPage() @{
	<main>
		<KrgrRoot data-krgr-page name="rows">
			<div data-krgr-controls>
				<KrgrAdd id="d" data-krgr-add-d>d</KrgrAdd>
				<KrgrRowDrop id="b" data-krgr-drop-b>drop b</KrgrRowDrop>
				<KrgrLength />
			</div>
			<Rows />
		</KrgrRoot>
	</main>
}

function Rows() @{
	const store = krgrStore();

	<div data-krgr-lists>
		<ul data-krgr-plain-list>
			@for (const row of store.rows; key row.id) {
				<li data-krgr-plain-row data-krgr-value={row.label}>{row.label}</li>
			}
		</ul>
		<div data-krgr-widget-list>
			@for (const row of store.rows; key row.id) {
				<KrgrItem row={row}>
					<KrgrItemDrop data-krgr-widget-drop>x</KrgrItemDrop>
				</KrgrItem>
			}
		</div>
	</div>
}
