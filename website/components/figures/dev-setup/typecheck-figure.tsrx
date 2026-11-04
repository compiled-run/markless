// The repo's typecheck output, with each error's file, line and column ringed.
import DeskFigure from '../ink/desk-figure.tsrx';
import { art } from './typecheck.art.ts';

export default function TypecheckFigure() @{
	<DeskFigure
		art={art}
		label="Read the typecheck output again"
		caption="A pen-and-ink drawing of a terminal sheet after pnpm run typecheck. Two errors are printed. broken.tsrx(4,1) error TS91001 is a Markless TSRX parse error, Unexpected token. app.tsrx(4,7) error TS2322 says Type number is not assignable to type string. Pen rings mark each line and column and each code. The last line reads Found 1 Markless TSRX compile error."
		said="Each error names its file with the line and column, then its code: TS91001 for a file that doesn't parse, TS2322 for a wrong type."
	/>
}
