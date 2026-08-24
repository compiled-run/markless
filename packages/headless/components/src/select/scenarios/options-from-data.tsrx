import { state } from '@markless/core';
import { select } from '../../index.ts';

// What a real select looks like: the options are data, and the items come from a
// keyed loop over them. `select.item` roots its own widget instance, so this is
// the widget-root-inside-a-repeat shape no family has proven yet - see note.md.
export function OptionsFromData() @{
	let fruits = state(['apple', 'banana', 'cherry']);

	<select.root data-testid="root">
		<select.label data-testid="label">Favorite Fruit</select.label>
		<select.trigger data-testid="trigger">Choose a Fruit</select.trigger>
		<select.content data-testid="content">
			<div data-testid="rows" role="presentation">
				@for (const fruit of fruits; key fruit) {
					<select.item value={fruit} data-testid="row">
						<select.itemlabel data-testid="row-itemlabel">{fruit}</select.itemlabel>
						<select.itemindicator data-testid="row-itemindicator">Chosen</select.itemindicator>
					</select.item>
				}
			</div>
		</select.content>
	</select.root>
}
