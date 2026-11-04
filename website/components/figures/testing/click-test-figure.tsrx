// A browser test clicking the Count button the way a visitor would.
import DeskFigure from '../ink/desk-figure.tsrx';
import { art } from './click-test.art.ts';

export default function ClickTestFigure() @{
	<DeskFigure
		art={art}
		label="Run the test again"
		caption="A pen-and-ink drawing of counter.browser.ts above a browser sheet with a Count 0 button. The line button.click() is ringed, and an arrow runs from it to the button. The button sinks, Count 0 becomes Count 1, and the test's toBe('Count 1') line gets a tick marked PASSES."
		said="The test clicked the button, the count went from 0 to 1, and the test passed."
	/>
}
