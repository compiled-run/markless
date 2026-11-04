// The four lines of a Markless error, numbered on the build's output, and the line of code they point at.
import DeskFigure from '../ink/desk-figure.tsrx';
import { art } from './read-error.art.ts';

export default function ReadErrorFigure() @{
	<DeskFigure
		art={art}
		label="Read the error again, line by line"
		caption="A pen-and-ink drawing of a terminal sheet showing the build's error for list.tsrx. Pen rings number its four lines: what broke and where, why, the fix, and the page to read. An arrow runs from the location pages/list.tsrx:8:4 to line 8 of list.tsrx on a second sheet, where the @for line gets ; key item added."
		said="Line 1 says what broke and where, line 2 why, line 3 the fix, line 4 the page. Line 8 of list.tsrx now reads @for (const item of items; key item)."
	/>
}
