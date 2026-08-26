import { progress } from '../../index.ts';

export default function OwnText() @{
	<progress.root value={30} data-testid="root">
		<progress.label data-testid="label">Export data</progress.label>
		<progress.valuelabel data-testid="valuelabel">30 of 100 rows</progress.valuelabel>
		<progress.track data-testid="track"><progress.indicator data-testid="indicator" /></progress.track>
	</progress.root>
}
