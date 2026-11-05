// A marionette's hands press the Count button on a page drawn on the spot and on one that arrived by post.
import DeskFigure from '../ink/desk-figure.tsrx';
import { art } from './marionette.art.ts';

export default function MarionetteFigure() @{
	<DeskFigure
		art={art}
		label="Work the strings again"
		caption="A pen-and-ink drawing of a marionette's wooden control bar, marked clickCounts(), hanging over two browser pages. Each bar end works a wooden hand on strings. The left page was drawn on the spot, by render(Counter). The right page arrived by post: it lies on an open envelope, by renderSSR(Counter). Both hands press the real Count button at once; on both pages Count 0 becomes Count 1, and each page gets a tick."
		said="Both hands pressed Count. The page from render(Counter) and the page from renderSSR(Counter) both read Count 1."
	/>
}
