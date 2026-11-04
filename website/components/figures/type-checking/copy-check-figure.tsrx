// app.tsrx, the TSX copy TypeScript checks, and the error that comes back to the line you wrote.
import DeskFigure from '../ink/desk-figure.tsrx';
import { art } from './copy-check.art.ts';

export default function CopyCheckFigure() @{
	<DeskFigure
		art={art}
		label="Check the file again"
		caption="A pen-and-ink drawing of app.tsrx on a sheet. An arrow hands it to a second sheet of scribbled lines, marked A TSX COPY, ONLY FOR THE CHECKER. TypeScript rings line 4 of the copy, TS2322, and an arrow carries the error back to app.tsrx, where a wavy line appears under label on line 4, column 7. Below, the checker prints app.tsrx(4,7): error TS2322: Type 'number' is not assignable to type 'string'."
		said="TypeScript found TS2322 in the copy, and the error points at line 4, column 7 of app.tsrx."
	/>
}
