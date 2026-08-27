import { progress } from '../../index.ts';

export default function Indeterminate() @{
	<progress.root value={null} data-testid="root">
		<progress.label data-testid="label">Loading...</progress.label>
		<progress.valuelabel data-testid="valuelabel" />
		<progress.track data-testid="track"><progress.indicator data-testid="indicator" /></progress.track>
	</progress.root>
}
