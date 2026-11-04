// One component's plan and the four places it renders.
import DeskFigure from '../ink/desk-figure.tsrx';
import { art } from './renders.art.ts';

export default function RendersFigure() @{
	<DeskFigure
		art={art}
		label="Follow the plan to each place again"
		caption="A pen-and-ink drawing of Counter.tsrx on a sheet, planned as the app builds. Four arrows run from it to four sheets: render() in the browser with a Count 0 button, renderToString() making HTML on a server, renderToStream() sending HTML in pieces, and @markless/vitest-browser running render(Counter) and renderSSR(Counter) in a browser test, both ticked."
		said="The same plan renders in the browser, on a server, as a stream and in a browser test."
	/>
}
