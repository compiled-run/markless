import { progress } from '../../index.ts';

export default function OwnName() @{
	<progress.root value={30} aria-label="Export data" data-testid="root">
		<progress.track data-testid="track"><progress.indicator data-testid="indicator" /></progress.track>
	</progress.root>
}
