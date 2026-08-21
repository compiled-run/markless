import { progress } from '../index.ts';

// The starter a consumer copies: a labelled bar part-way through a job.
export default function Basic() @{
	<progress.root value={30} data-testid="root">
		<progress.label data-testid="label">Export data 30%</progress.label>
		<progress.track data-testid="track"><progress.indicator data-testid="indicator" /></progress.track>
	</progress.root>
}
