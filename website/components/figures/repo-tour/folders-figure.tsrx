// The repo's other top-level folders and the ones to skip.
import DeskFigure from '../ink/desk-figure.tsrx';
import { art } from './folders.art.ts';

export default function FoldersFigure() @{
	<DeskFigure
		art={art}
		label="Label the folders again"
		caption="A pen-and-ink drawing of seven folders on a desk, each labelled inside: specs/ the behavior contract, demos/ demo apps, poc/ design evidence, scripts/ CI, release and benchmarks, docs/ CI process and CI failures, .ruler/ agent rules and skills, website/ this site. A slip lists goals/, dist/ and .witness/, crossed out and marked skip."
		said="Seven folders are labelled with their jobs, and goals/, dist/ and .witness/ are crossed out to skip."
	/>
}
