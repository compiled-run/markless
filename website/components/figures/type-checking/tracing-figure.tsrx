// Tracing paper over app.tsrx: TypeScript marks the traced copy, and the mark lands on line 4, column 7 of the file.
import DeskFigure from '../ink/desk-figure.tsrx';
import { art } from './tracing.art.ts';

export default function TracingFigure() @{
	<DeskFigure
		art={art}
		label="Lay the tracing paper over the file again"
		caption="A pen-and-ink drawing of app.tsrx, whose line 4 reads <Nav label={42} />. A sheet of tracing paper, the TSX copy, lies over it while TypeScript rings the label on the tracing in red pencil and writes TS2322. Then the tracing is lifted away and lies below the file, labelled the TSX copy, only for the checker. On the file itself a red wavy line now sits under label, marked line 4, column 7; nothing else on the file changed."
		said="TypeScript marked the copy with TS2322, and the mark landed on label, line 4, column 7 of app.tsrx."
	/>
}
