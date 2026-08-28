import { state } from '@markless/core';
import { panel } from './index.ts';

type Row = {
	readonly id: string;
	readonly rows: readonly Row[];
};

// A component that composes ITSELF through a keyed `@for`, with the recursive
// edge projected two component tags deep and an imported family part beside it.
// That mix is what makes this module's route table carry all three route kinds:
// a plain child-module route, a self-recursive route naming this module, and a
// same-module route that recurses in place.
function Node({ label, rows }: { readonly label: string; readonly rows: readonly Row[] }) @{
	let expanded = state(true);

	<panel.item data-testid={label + '-item'}>
		<panel.itemlabel data-testid={label + '-itemlabel'}>{label}</panel.itemlabel>
		<panel.itemcontent data-testid={label + '-itemcontent'}>
			<ul onClick={() => expanded = expanded !== true}>
				@for (const row of rows; key row.id) {
					<Node label={row.id} rows={row.rows} />
				}
			</ul>
		</panel.itemcontent>
	</panel.item>
}

export default function Rows({ rows }: { readonly rows: readonly Row[] }) @{
	<panel.root data-testid="root">
		<ul role="none">
			@for (const row of rows; key row.id) {
				<Node label={row.id} rows={row.rows} />
			}
		</ul>
	</panel.root>
}
