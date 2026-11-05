// Every docs page set in the same composing stick, title to limits.
import DeskFigure from '../ink/desk-figure.tsrx';
import { art } from './composing-stick.art.ts';

export default function ComposingStickFigure() @{
	<DeskFigure
		art={art}
		label="Set the page again"
		caption="A pen-and-ink drawing of a printer's type case and, in front of it, a composing stick. Six lines of type are set into the stick one after another, in the same order on every page: the # title, PageMeta with its time, Subtitle, one real example in a tsrx fence, 3 to 6 sections with one idea each, and the limits last."
		said="Title, PageMeta, Subtitle and one example set first, then 3 to 6 sections, and the limits last, on every page."
	/>
}
