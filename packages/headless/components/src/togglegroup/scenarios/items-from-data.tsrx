import { state } from '@markless/core';
import { togglegroup } from '../../index.ts';

// What a real toolbar looks like: the items are data, and a keyed loop builds
// them - rows built by a loop take the group's name the same as items written
// flat, which is the hole radio-group found and the reason `name` is declared by
// the root and by nothing else.
export default function ItemsFromData() @{
	let styles = state(['bold', 'italic', 'underline']);

	<togglegroup.root multiple name="style" value={['italic']} data-testid="root">
		<togglegroup.label data-testid="label">Text style</togglegroup.label>
		<div data-testid="rows">
			@for (const style of styles; key style) {
				<togglegroup.item value={style} data-testid="row">
					{style}
					<togglegroup.itemfield data-testid="row-field" />
				</togglegroup.item>
			}
		</div>
	</togglegroup.root>
}
