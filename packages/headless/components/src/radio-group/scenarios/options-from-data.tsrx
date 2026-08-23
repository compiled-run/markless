import { state } from '@markless/core';
import * as radiogroup from '../index.ts';

// What a real radio group looks like: the options are data, and the items come
// from a keyed loop over them. The field is written after the loop on purpose:
// where it sits must not decide what the options submit under.
export function OptionsFromData() @{
	let plans = state(['monthly', 'annual', 'lifetime']);

	<radiogroup.root data-testid="root">
		<radiogroup.label data-testid="label">Billing Period</radiogroup.label>
		<radiogroup.field name="plan" />
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
