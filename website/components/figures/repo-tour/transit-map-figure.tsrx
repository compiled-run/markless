// The repo's packages as a transit map: a compile line and a render line meeting at web.
import DeskFigure from '../ink/desk-figure.tsrx';
import { art } from './transit-map.art.ts';

export default function TransitMapFigure() @{
	<DeskFigure
		art={art}
		label="Ride the map again"
		caption="A pen-and-ink drawing of a printed transit map. A purple compile line starts at Counter.tsrx and runs through compiler and bundler, with a branch from compiler ending at typescript-plugin. It meets the green render line at an interchange, web. The render line runs from core through web, runtime and serializer, then splits to four termini: a browser, a server, a build step and a test. White chevrons on every line point one way."
		said="Counter.tsrx rides from compiler and bundler to web, then through runtime and serializer to a browser, a server, a build step and a test."
	/>
}
