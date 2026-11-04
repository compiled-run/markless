// A .tsrx file through the compile-time packages, then the render packages, out to where a page runs.
import DeskFigure from '../ink/desk-figure.tsrx';
import { art } from './pipeline.art.ts';

export default function PipelineFigure() @{
	<DeskFigure
		art={art}
		label="Send Counter.tsrx through the packages again"
		caption="A pen-and-ink drawing of the Markless pipeline as folders on a desk. Counter.tsrx goes into the compiler folder, which reads .tsrx and plans it, and the bundler folder, which runs it in Vite or Rolldown. Then come the web folder, which renders and resumes, the runtime folder, the state graph, and the serializer folder, the payload types. Arrows run out to four slips: a browser, a server, a build step and a test."
		said="Counter.tsrx went through compiler and bundler before the app ran, then web, runtime and serializer ran it in a browser, a server, a build step and a test."
	/>
}
