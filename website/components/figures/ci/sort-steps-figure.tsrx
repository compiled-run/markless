// Ci.yml's typecheck job, each step sorted by ci:local.
import DeskFigure from '../ink/desk-figure.tsrx';
import { art } from './sort-steps.art.ts';

export default function SortStepsFigure() @{
	<DeskFigure
		art={art}
		label="Sort the steps again"
		caption="A pen-and-ink drawing of the typecheck job's steps in ci.yml. The three uses: steps are struck through and labelled skip. The pnpm install step is ringed and labelled setup. The three run: steps that check something are ticked and labelled check."
		said="Uses steps are skipped, the install is setup, and the three checks run."
	/>
}
