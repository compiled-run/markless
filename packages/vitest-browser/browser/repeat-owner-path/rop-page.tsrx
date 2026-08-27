import { state } from '@markless/core';
import { RopPanel, RopRow } from './rop-family.tsrx';
import { type RopRowValue, withRow } from './rop-rows.ts';

function RopRows({ rows = [] as readonly RopRowValue[] }) @{
	<ul data-rop-list>
		@for (const row of rows; key row.id) {
			<RopRow label={row.label} />
		}
	</ul>
}

// The collection lives on the PAGE, above the panel root that owns the widget
// the rows read. Two panels over the one cell keep the answer per instance.
export default function RopPage() @{
	const store = state({
		rows: [
			{ id: 'a', label: 'alpha' },
			{ id: 'b', label: 'bravo' },
			{ id: 'c', label: 'charlie' },
		] as readonly RopRowValue[],
	});

	<main>
		<button
			type="button"
			data-rop-add
			onClick={() => {
				store.rows = withRow(store.rows, 'd');
			}}
		>add</button>
		<output data-rop-count>{store.rows.length}</output>
		<RopPanel label="left" data-rop-left>
			<RopRows rows={store.rows} />
		</RopPanel>
		<RopPanel label="right" data-rop-right>
			<RopRows rows={store.rows} />
		</RopPanel>
	</main>
}
