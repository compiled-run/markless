// The build's error as a citation under the wiper of list.tsrx, then the fix on line 8.
import DeskFigure from '../ink/desk-figure.tsrx';
import { art } from './citation.art.ts';

export default function CitationFigure() @{
	<DeskFigure
		art={art}
		label="Read the citation again"
		caption="A pen-and-ink drawing of list.tsrx with a citation tucked under a windscreen wiper lying across it. The citation says compile blocked, pages/list.tsrx, 1 error, and has four numbered boxes filled from the error: 1 what and where, MARKLESS_REPEAT_KEY_REQUIRED at pages/list.tsrx:8:4; 2 why, the rows have no identity to update, reorder, or resume by; 3 the fix, @for (const item of items; key item.id); 4 read more, markless.dev/errors/MARKLESS_REPEAT_KEY_REQUIRED. Line 8 of the file is underlined, then rewritten as @for (const item of items; key item)."
		said="Box 1 says what broke and where, box 2 why, box 3 the fix, box 4 the page. Line 8 now has its key."
	/>
}
