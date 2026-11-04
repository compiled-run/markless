// A new app's tsconfig.json with its three Markless lines ringed and explained.
import DeskFigure from '../ink/desk-figure.tsrx';
import { art } from './tsconfig.art.ts';

export default function TsconfigFigure() @{
	<DeskFigure
		art={art}
		label="Ring the three lines again"
		caption="A pen-and-ink drawing of tsconfig.json. Three values are ringed and numbered. 1, tsrx.compiler @markless/typescript-plugin/volar: read .tsrx files the Markless way. 2, the @markless/typescript-plugin entry: suggestions, hints, errors and .tsrx imports. 3, the @markless/router/typescript-plugin entry: your page addresses inside href."
		said="Line 3 makes the tools read .tsrx files the Markless way. Line 8 adds suggestions, hints and errors. Line 9 suggests page addresses inside href."
	/>
}
