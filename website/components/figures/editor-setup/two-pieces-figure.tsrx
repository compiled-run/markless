// The two pieces of editor support on one file: the extension's colours, then the plugin's red line and suggestions.
import DeskFigure from '../ink/desk-figure.tsrx';
import { art } from './two-pieces.art.ts';

export default function TwoPiecesFigure() @{
	<DeskFigure
		art={art}
		label="Open the file again"
		caption="A pen-and-ink drawing of counter.tsrx open in an editor. The code starts plain grey, then takes on colours, marked COLOURS: THE EXTENSION. A red wavy line appears under onClik, marked RED LINE: THE PLUGIN. Typing @ on a new line opens a list of @if, @for and @try, marked SUGGESTIONS: THE PLUGIN."
		said="The extension coloured the file. The plugin drew the red line under onClik and suggested @if, @for and @try."
	/>
}
