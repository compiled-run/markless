import { state } from '@markless/core';
import {
	LrbFlip,
	LrbFlipTitle,
	LrbNext,
	LrbRoot,
	LrbTap,
	LrbTaps,
	LrbTitle,
} from './lrb-family.tsrx';

// The consumer feeds a value back into the widget, the way a controlled calendar
// does: the idle gesture moves only that value, so the widget's root rewrites its
// own state and nothing a live region shows changes.
export default function LiveRegionBranchPage() @{
	const log = state({ picked: 'none', gestures: 0 });

	<main>
		<LrbRoot month="August" picked={log.picked} data-testid="root">
			<LrbTitle data-testid="live-branch" />
			<LrbFlipTitle data-testid="live-flip" />
			<LrbTaps data-testid="live-slot" />
			<LrbTap data-testid="tap">Tap</LrbTap>
			<LrbNext data-testid="retitle">Next month</LrbNext>
			<LrbFlip data-testid="flip">Flip</LrbFlip>
		</LrbRoot>
		<output data-testid="aside">{log.gestures}</output>
		<button
			type="button"
			data-testid="idle"
			onClick={() => {
				log.gestures = log.gestures + 1;
				log.picked = `pick-${log.gestures}`;
			}}
		>
			Idle
		</button>
	</main>
}
