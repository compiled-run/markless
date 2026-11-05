// A pull request through GitHub's full checks and the merge queue's gate to main.
import DeskFigure from '../ink/desk-figure.tsrx';
import { art } from './security-gate.art.ts';

export default function SecurityGateFigure() @{
	<DeskFigure
		art={art}
		label="Send the pull request through again"
		caption="A pen-and-ink drawing of an airport security belt. A tray holding your pull request rides into a tunnel marked GitHub and comes out ticked by browser, boxes-router, perf-guards and build-warnings. At the gate, the merge queue scans the exact commit it will land, again, and stamps test, typecheck and agent-files as passed. Then a paper plane marked main."
		said="The full checks passed, the merge queue re-tested the exact commit, and it boarded main."
	/>
}
