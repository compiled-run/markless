// The first pull request as a board game: six squares in order, review cards to answer, and main only through the merge-queue square.
import DeskFigure from '../ink/desk-figure.tsrx';
import { art } from './board.art.ts';

export default function BoardFigure() @{
	<DeskFigure
		art={art}
		label="Play the pull request again"
		caption="A pen-and-ink drawing of a board game on a desk, with a die beside it. A pawn, your branch, walks six numbered squares in order: read the rules, write the failing test, make the smallest change, run the two checks, commit while the hook runs, answer every finding. The test square shows red first: the test fails before it passes. Two review cards, right: fix it, and stale or wrong: reply, get ticks. The pawn then crosses the merge queue square, where test, typecheck and agent-files are ticked, the only way onto main, and stops on main."
		said="The pawn walked all six squares, the test failed before it passed, both review cards were answered, and it reached main through the merge queue."
	/>
}
