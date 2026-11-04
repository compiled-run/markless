// A warning silenced by a markless-allow comment with its reason.
import DeskFigure from '../ink/desk-figure.tsrx';
import { art } from './allow.art.ts';

export default function AllowFigure() @{
	<DeskFigure
		art={art}
		label="Write the comment again"
		caption="A pen-and-ink drawing of records.tsrx printed on a sheet. The @for line has a wavy warning line under index slot; key slot. A comment is written above it: // markless-allow MARKLESS_REPEAT_KEY_IS_INDEX: a fixed list, its order never changes. Its reason is ringed, and the wavy line is gone."
		said="The markless-allow comment above the @for line names the warning and gives a reason, and the wavy line is gone."
	/>
}
