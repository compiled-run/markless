// A docs page's .mdx source with each part of its shape labelled.
import DeskFigure from '../ink/desk-figure.tsrx';
import { art } from './page-shape.art.ts';

export default function PageShapeFigure() @{
	<DeskFigure
		art={art}
		label="Label the page again"
		caption="A pen-and-ink drawing of reading-tsrx.mdx printed on a sheet. Pen notes label each part: the # title is a claim or a task, PageMeta's time comes from the formula, Subtitle is one sentence, then one real example in a tsrx fence. A bracket groups the ## sections, 3 to 6 with one idea each, and the limits list comes last."
		said="Title, PageMeta, Subtitle and one example open the page, then 3 to 6 sections, and the limits last."
	/>
}
