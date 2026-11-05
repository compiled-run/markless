// Reading glasses on the printed counter.tsrx: one lens colours the code, the other shows the plugin's red line and suggestions.
import DeskFigure from '../ink/desk-figure.tsrx';
import { art } from './glasses.art.ts';

export default function GlassesFigure() @{
	<DeskFigure
		art={art}
		label="Put the glasses on again"
		caption="A pen-and-ink drawing of counter.tsrx printed in plain grey, with a pair of reading glasses lying on it. Under one lens, marked the extension: colours, the code turns colour: import, from, function, Counter and the string. Under the other lens, marked the plugin: red lines, suggestions, a red wavy line runs under onClik and a list of @if, @for and @try opens under the @ on the next line. Outside both lenses the print stays grey."
		said="Under the extension's lens the code is coloured. Under the plugin's lens, onClik has a red line and the @ offers @if, @for and @try."
	/>
}
