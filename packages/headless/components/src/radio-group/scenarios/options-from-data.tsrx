import { state } from '@markless/core';
import * as radiogroup from '../index.ts';

// What a real radio group looks like: the options are data, and the items come
// from a keyed loop over them.
export function OptionsFromData() @{
	let plans = state(['monthly', 'annual', 'lifetime']);

	<radiogroup.root name="plan" data-testid="root">
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
