import { progress } from '../../index.ts';

export default function Basic() @{
	<progress.root value={30} data-testid="root">
		<progress.label data-testid="label">Export data</progress.label>
		<progress.valuelabel data-testid="valuelabel" />
		<progress.track data-testid="track"><progress.indicator data-testid="indicator" /></progress.track>
	</progress.root>
}
