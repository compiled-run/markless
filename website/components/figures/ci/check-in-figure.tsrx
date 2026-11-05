// Checking in at home: ci:local --fast prints a boarding pass stamped by each fast job.
import DeskFigure from '../ink/desk-figure.tsrx';
import { art } from './check-in.art.ts';

export default function CheckInFigure() @{
	<DeskFigure
		art={art}
		label="Check in again"
		caption="A pen-and-ink drawing of a terminal running pnpm ci:local --fast, which prints a boarding pass: checked in at home, from ci.yml. Four boxes on the pass, agent-files, typecheck, typecheck-ts7 and unit, each get a PASSED stamp, with the seconds each took. The torn-off stub says next: security, on GitHub, for browser, boxes, perf-guards, test and the rest."
		said="All four fast jobs stamped the pass at home. The full checks come next, on GitHub."
	/>
}
