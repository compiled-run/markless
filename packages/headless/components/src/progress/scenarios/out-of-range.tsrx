import { progress } from '../../index.ts';

// Amounts outside the range the bar was given: a byte counter that overshoots its
// estimate, and a countdown that runs past its own floor.
export default function OutOfRange() @{
	<section>
		<progress.root value={150} data-testid="over-root">
			<progress.track data-testid="over-track">
				<progress.indicator data-testid="over-indicator" />
			</progress.track>
		</progress.root>
		<progress.root value={-20} data-testid="under-root">
			<progress.track data-testid="under-track">
				<progress.indicator data-testid="under-indicator" />
			</progress.track>
		</progress.root>
	</section>
}
