// The dev and build scripts on a terminal sheet, and where each one lands.
import DeskFigure from '../ink/desk-figure.tsrx';
import { art } from './scripts.art.ts';

export default function ScriptsFigure() @{
	<DeskFigure
		art={art}
		label="Run the two scripts again"
		caption="A pen-and-ink drawing of a terminal sheet with npm run dev and npm run build. An arrow from npm run dev reaches a browser sheet at localhost:3000 showing the starter page, Markless Router and a Count 0 button. An arrow from npm run build reaches a folder named .output/ holding server/index.mjs, which node runs."
		said="npm run dev serves the starter page at localhost:3000. npm run build writes the app and its server into .output/, and node runs server/index.mjs."
	/>
}
