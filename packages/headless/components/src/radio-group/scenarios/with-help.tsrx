import { radiogroup } from '../../index.ts';

// Help text and a validation message. The second group writes its error BEFORE
// the options, because document order must not decide whether the group counts
// as invalid.
export function WithHelp() @{
	<section>
		<radiogroup.root data-testid="after-root">
			<radiogroup.label data-testid="after-label">Billing Period</radiogroup.label>
			<radiogroup.description data-testid="after-description">Switch plans whenever you like.</radiogroup.description>
			<radiogroup.item value="monthly" data-testid="after-monthly">
				<radiogroup.itemfield data-testid="after-monthly-field" />
				<radiogroup.itemtrigger data-testid="after-monthly-trigger">
					<radiogroup.itemindicator data-testid="after-monthly-indicator">Chosen</radiogroup.itemindicator>
				</radiogroup.itemtrigger>
				<radiogroup.itemlabel data-testid="after-monthly-label">Monthly</radiogroup.itemlabel>
			</radiogroup.item>
			<radiogroup.error data-testid="after-error">Pick a billing period</radiogroup.error>
		</radiogroup.root>
		<radiogroup.root data-testid="before-root">
			<radiogroup.label data-testid="before-label">Support Plan</radiogroup.label>
			<radiogroup.error data-testid="before-error">Pick a support plan</radiogroup.error>
			<radiogroup.item value="basic" data-testid="before-basic">
				<radiogroup.itemfield data-testid="before-basic-field" />
				<radiogroup.itemtrigger data-testid="before-basic-trigger">
					<radiogroup.itemindicator data-testid="before-basic-indicator">Chosen</radiogroup.itemindicator>
				</radiogroup.itemtrigger>
				<radiogroup.itemlabel data-testid="before-basic-label">Basic</radiogroup.itemlabel>
			</radiogroup.item>
		</radiogroup.root>
	</section>
}
