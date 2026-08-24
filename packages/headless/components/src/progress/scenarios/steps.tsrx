import { progress } from '../../index.ts';

export default function Steps() @{
	<progress.root value={20} max={25} data-testid="root">
		<progress.label data-testid="label">Custom Max Progress</progress.label>
		<progress.track data-testid="track"><progress.indicator data-testid="indicator" /></progress.track>
	</progress.root>
}
