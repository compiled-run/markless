import { state } from '@markless/core';
import { checklist } from '../../index.ts';

// What a real list looks like: the options are data, and the items come from a
// keyed loop over them. The same array is the root's `values` and the loop's
// source, so the select-all and the rendered rows agree about what exists.
export default function ItemsFromData() @{
	let condiments = state(['lettuce', 'tomato', 'mustard']);

	<checklist.root values={condiments} data-testid="root">
		<checklist.label data-testid="label">Sandwich Condiments</checklist.label>
		<checklist.selectall data-testid="selectall-trigger">
			<checklist.selectallindicator data-testid="selectall-indicator">Checked</checklist.selectallindicator>
		</checklist.selectall>
		<div data-testid="rows">
			@for (const condiment of condiments; key condiment) {
				<div data-row={condiment}>
					<checklist.item value={condiment}>
						<checklist.itemtrigger data-testid="row-trigger">
							<checklist.itemindicator data-testid="row-indicator">Checked</checklist.itemindicator>
						</checklist.itemtrigger>
						<checklist.itemlabel data-testid="row-label">{condiment}</checklist.itemlabel>
					</checklist.item>
				</div>
			}
		</div>
	</checklist.root>
}
