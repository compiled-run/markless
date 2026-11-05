// A signed permit with a reason, clipped to records.tsrx, waiving one warning.
import DeskFigure from '../ink/desk-figure.tsrx';
import { art } from './permit.art.ts';

export default function PermitFigure() @{
	<DeskFigure
		art={art}
		label="Sign the permit again"
		caption="A pen-and-ink drawing of records.tsrx with a wavy warning line under index slot; key slot on its @for line. A permit slip is clipped to the sheet: code MARKLESS_REPEAT_KEY_IS_INDEX, reason a fixed list, its order never changes, ringed, and signed. Then the comment // markless-allow MARKLESS_REPEAT_KEY_IS_INDEX: a fixed list, its order never changes appears above the @for line and the wavy line goes."
		said="The permit names the warning and its reason, the comment is written above the @for line, and the wavy line is gone."
	/>
}
