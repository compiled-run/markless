import { state } from '@markless/core';
import { radiogroup } from '../../index.ts';

// The consumer's own handler, logged so the suite can read what it was called
// with and how often.
export function WithOnChange() @{
	let chosen = state('');
	let calls = state(0);

	<section>
		<radiogroup.root
			data-testid="root"
			onChange={(value: string) => {
				chosen = value;
				calls = calls + 1;
			}}
		>
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
		</radiogroup.root>
		<output data-testid="value">{chosen}</output>
		<output data-testid="calls">{calls}</output>
	</section>
}
