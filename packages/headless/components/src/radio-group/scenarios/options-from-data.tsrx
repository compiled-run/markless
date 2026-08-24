import { state } from '@markless/core';
import { radiogroup } from '../../index.ts';

// What a real radio group looks like: the options are data, and the items come
// from a keyed loop over them - rows built by a loop take the group's name the
// same as options written flat.
export function OptionsFromData() @{
	let plans = state(['monthly', 'annual', 'lifetime']);

	<radiogroup.root data-testid="root" name="plan">
		<radiogroup.label data-testid="label">Billing Period</radiogroup.label>
		<div data-testid="rows">
			@for (const plan of plans; key plan) {
				<radiogroup.item value={plan} data-testid="row">
					<radiogroup.itemfield data-testid="row-field" />
					<radiogroup.itemtrigger data-testid="row-trigger">
						<radiogroup.itemindicator data-testid="row-indicator">Chosen</radiogroup.itemindicator>
					</radiogroup.itemtrigger>
					<radiogroup.itemlabel data-testid="row-label">{plan}</radiogroup.itemlabel>
				</radiogroup.item>
			}
		</div>
	</radiogroup.root>
}
