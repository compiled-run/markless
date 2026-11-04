// render() and renderSSR() as two ways in that meet at one check.
import DeskFigure from '../ink/desk-figure.tsrx';
import { art } from './two-ways.art.ts';

export default function TwoWaysFigure() @{
	<DeskFigure
		art={art}
		label="Run both tests again"
		caption="A pen-and-ink drawing of two slips side by side. await render(Counter), marked MOUNTED IN THE BROWSER, and await renderSSR(Counter), marked HTML FROM THE TEST SERVER. Each arrow leads to a browser sheet with a Count 0 button, and both browser sheets lead to one slip: async function clickCounts, with a tick beside each test, marked ONE CHECK, BOTH WAYS."
		said="Both tests ran the same clickCounts check, and both passed."
	/>
}
