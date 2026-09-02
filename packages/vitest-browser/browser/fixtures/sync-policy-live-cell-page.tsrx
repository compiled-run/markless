import { PickerField, PickerRoot, PickerToggle } from './sync-policy-live-cell.tsrx';

export default function SyncPolicyLiveCellPage() @{
	<main data-sync-policy-live-cell>
		<PickerRoot>
			<PickerField />
			<PickerToggle />
		</PickerRoot>
	</main>
}
