// A pull request through its checks and the merge queue to main.
import DeskFigure from '../ink/desk-figure.tsrx';
import { art } from './merge-queue.art.ts';

export default function MergeQueueFigure() @{
	<DeskFigure
		art={art}
		label="Send the pull request through again"
		caption="A pen-and-ink drawing of a pull request sheet whose three required checks, test, typecheck and agent-files, get ticks. An arrow takes it into a folder labelled merge queue, where ci.yml runs again on the exact commit it lands, and a second arrow takes it to main."
		said="All three required checks passed, the merge queue tested the exact commit, and it landed on main."
	/>
}
