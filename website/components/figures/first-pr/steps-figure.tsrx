// The six steps of a first pull request, then the merge queue into main.
import DeskFigure from '../ink/desk-figure.tsrx';
import { art } from './steps.art.ts';

export default function StepsFigure() @{
	<DeskFigure
		art={art}
		label="Walk the branch through the six steps again"
		caption="A pen-and-ink drawing of six numbered cards on a desk, with arrows leading a branch, fix/counter-text, from card to card: read the rules, write the failing test, make the smallest change, run the two checks, commit and let the hook run, answer every finding. The test card first gets a cross marked fails, then a tick once the change is made. The last card leads into a merge queue slip whose three required checks, test, typecheck and agent-files, get ticks, and an arrow runs on to main."
		said="The branch passed all six steps in order, the merge queue ticked test, typecheck and agent-files, and the change landed on main."
	/>
}
