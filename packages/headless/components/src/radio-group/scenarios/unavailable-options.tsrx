import { radiogroup } from '../../index.ts';

// One option nobody may choose inside a group that is otherwise usable, and a
// whole group nobody may touch.
export function UnavailableOptions() @{
	<section>
		<radiogroup.root data-testid="root">
			<radiogroup.label data-testid="label">Billing Period</radiogroup.label>
			<radiogroup.item value="monthly" data-testid="monthly">
				<radiogroup.itemfield data-testid="monthly-field" />
				<radiogroup.itemtrigger data-testid="monthly-trigger">
					<radiogroup.itemindicator data-testid="monthly-indicator">Chosen</radiogroup.itemindicator>
				</radiogroup.itemtrigger>
				<radiogroup.itemlabel data-testid="monthly-label">Monthly</radiogroup.itemlabel>
			</radiogroup.item>
			<radiogroup.item value="lifetime" disabled data-testid="lifetime">
				<radiogroup.itemfield data-testid="lifetime-field" />
				<radiogroup.itemtrigger data-testid="lifetime-trigger">
					<radiogroup.itemindicator data-testid="lifetime-indicator">Chosen</radiogroup.itemindicator>
				</radiogroup.itemtrigger>
				<radiogroup.itemlabel data-testid="lifetime-label">Lifetime</radiogroup.itemlabel>
			</radiogroup.item>
			<radiogroup.item value="annual" data-testid="annual">
				<radiogroup.itemfield data-testid="annual-field" />
				<radiogroup.itemtrigger data-testid="annual-trigger">
					<radiogroup.itemindicator data-testid="annual-indicator">Chosen</radiogroup.itemindicator>
				</radiogroup.itemtrigger>
				<radiogroup.itemlabel data-testid="annual-label">Annual</radiogroup.itemlabel>
			</radiogroup.item>
		</radiogroup.root>
		<radiogroup.root disabled value="basic" data-testid="locked-root">
			<radiogroup.label data-testid="locked-label">Support Plan</radiogroup.label>
			<radiogroup.item value="basic" data-testid="locked-basic">
				<radiogroup.itemfield data-testid="locked-basic-field" />
				<radiogroup.itemtrigger data-testid="locked-basic-trigger">
					<radiogroup.itemindicator data-testid="locked-basic-indicator">Chosen</radiogroup.itemindicator>
				</radiogroup.itemtrigger>
				<radiogroup.itemlabel data-testid="locked-basic-label">Basic</radiogroup.itemlabel>
			</radiogroup.item>
			<radiogroup.item value="premium" data-testid="locked-premium">
				<radiogroup.itemfield data-testid="locked-premium-field" />
				<radiogroup.itemtrigger data-testid="locked-premium-trigger">
					<radiogroup.itemindicator data-testid="locked-premium-indicator">Chosen</radiogroup.itemindicator>
				</radiogroup.itemtrigger>
				<radiogroup.itemlabel data-testid="locked-premium-label">Premium</radiogroup.itemlabel>
			</radiogroup.item>
		</radiogroup.root>
	</section>
}
