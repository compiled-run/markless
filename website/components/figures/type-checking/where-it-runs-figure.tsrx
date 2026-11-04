// Where a .tsrx type check runs today: the editor, and not npm run build or npm run check.
import DeskFigure from '../ink/desk-figure.tsrx';
import { art } from './where-it-runs.art.ts';

export default function WhereItRunsFigure() @{
	<DeskFigure
		art={art}
		label="Mark the three places again"
		caption="A pen-and-ink drawing of three sheets. The editor shows label={42} with a wavy line and a tick, marked CHECKED AS YOU TYPE. A terminal running npm run build gets a cross, marked A WRONG PROP STILL BUILDS. A terminal running npm run check gets a cross, marked NO .TSRX TYPES."
		said="Your editor checks .tsrx types. npm run build and npm run check don't."
	/>
}
