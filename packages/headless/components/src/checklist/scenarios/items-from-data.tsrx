import { state } from '@markless/core';
import { checkbox, checklist } from '../../index.ts';

// What a real list looks like: the options are data, and the items come from a
// keyed loop over them. The same array is the root's `values` and the loop's
// source, so the select-all and the rendered rows agree about what exists.
export default function ItemsFromData() @{
	let condiments = state(['lettuce', 'tomato', 'mustard']);

	<checklist.root values={condiments} data-testid="root">
		<checklist.label data-testid="label">Sandwich Condiments</checklist.label>
		<checklist.selectall data-testid="selectall">
			<checkbox.trigger data-testid="selectall-trigger">
				<checkbox.indicator data-testid="selectall-indicator">Checked</checkbox.indicator>
			</checkbox.trigger>
			<checkbox.label data-testid="selectall-label">All condiments</checkbox.label>
		</checklist.selectall>
		<div data-testid="rows">
			@for (const condiment of condiments; key condiment) {
				<div data-row={condiment}>
					<checklist.item value={condiment}>
						<checkbox.trigger data-testid="row-trigger">
							<checkbox.indicator data-testid="row-indicator">Checked</checkbox.indicator>
						</checkbox.trigger>
						<checkbox.label data-testid="row-label">{condiment}</checkbox.label>
					</checklist.item>
				</div>
			}
		</div>
	</checklist.root>
}
