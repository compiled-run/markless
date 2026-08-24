import { radiogroup } from '../../index.ts';

// The starter a consumer copies: three billing options, none chosen yet.
export function Basic() @{
	<radiogroup.root data-testid="root">
		<radiogroup.label data-testid="label">Billing Period</radiogroup.label>
		<radiogroup.item value="monthly" data-testid="monthly">
			<radiogroup.itemfield data-testid="monthly-field" />
			<radiogroup.itemtrigger data-testid="monthly-trigger">
				<radiogroup.itemindicator data-testid="monthly-indicator">Chosen</radiogroup.itemindicator>
			</radiogroup.itemtrigger>
			<radiogroup.itemlabel data-testid="monthly-label">Monthly</radiogroup.itemlabel>
		</radiogroup.item>
		<radiogroup.item value="annual" data-testid="annual">
			<radiogroup.itemfield data-testid="annual-field" />
			<radiogroup.itemtrigger data-testid="annual-trigger">
				<radiogroup.itemindicator data-testid="annual-indicator">Chosen</radiogroup.itemindicator>
			</radiogroup.itemtrigger>
			<radiogroup.itemlabel data-testid="annual-label">Annual</radiogroup.itemlabel>
		</radiogroup.item>
		<radiogroup.item value="lifetime" data-testid="lifetime">
			<radiogroup.itemfield data-testid="lifetime-field" />
			<radiogroup.itemtrigger data-testid="lifetime-trigger">
				<radiogroup.itemindicator data-testid="lifetime-indicator">Chosen</radiogroup.itemindicator>
			</radiogroup.itemtrigger>
			<radiogroup.itemlabel data-testid="lifetime-label">Lifetime</radiogroup.itemlabel>
		</radiogroup.item>
	</radiogroup.root>
}
