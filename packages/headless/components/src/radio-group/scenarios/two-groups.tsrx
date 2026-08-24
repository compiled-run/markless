import { radiogroup } from '../../index.ts';

// Two groups on one page. Each root is its own instance boundary, so arrowing
// through one must leave the other's choice exactly where it was.
export function TwoGroups() @{
	<section>
		<radiogroup.root data-testid="left-root" name="plan">
			<radiogroup.label data-testid="left-label">Billing Period</radiogroup.label>
			<radiogroup.item value="monthly" data-testid="left-monthly">
				<radiogroup.itemfield data-testid="left-monthly-field" />
				<radiogroup.itemtrigger data-testid="left-monthly-trigger">
					<radiogroup.itemindicator data-testid="left-monthly-indicator">Chosen</radiogroup.itemindicator>
				</radiogroup.itemtrigger>
				<radiogroup.itemlabel data-testid="left-monthly-label">Monthly</radiogroup.itemlabel>
			</radiogroup.item>
			<radiogroup.item value="annual" data-testid="left-annual">
				<radiogroup.itemfield data-testid="left-annual-field" />
				<radiogroup.itemtrigger data-testid="left-annual-trigger">
					<radiogroup.itemindicator data-testid="left-annual-indicator">Chosen</radiogroup.itemindicator>
				</radiogroup.itemtrigger>
				<radiogroup.itemlabel data-testid="left-annual-label">Annual</radiogroup.itemlabel>
			</radiogroup.item>
		</radiogroup.root>
		<radiogroup.root data-testid="right-root" name="support">
			<radiogroup.label data-testid="right-label">Support Plan</radiogroup.label>
			<radiogroup.item value="basic" data-testid="right-basic">
				<radiogroup.itemfield data-testid="right-basic-field" />
				<radiogroup.itemtrigger data-testid="right-basic-trigger">
					<radiogroup.itemindicator data-testid="right-basic-indicator">Chosen</radiogroup.itemindicator>
				</radiogroup.itemtrigger>
				<radiogroup.itemlabel data-testid="right-basic-label">Basic</radiogroup.itemlabel>
			</radiogroup.item>
			<radiogroup.item value="premium" data-testid="right-premium">
				<radiogroup.itemfield data-testid="right-premium-field" />
				<radiogroup.itemtrigger data-testid="right-premium-trigger">
					<radiogroup.itemindicator data-testid="right-premium-indicator">Chosen</radiogroup.itemindicator>
				</radiogroup.itemtrigger>
				<radiogroup.itemlabel data-testid="right-premium-label">Premium</radiogroup.itemlabel>
			</radiogroup.item>
		</radiogroup.root>
	</section>
}
