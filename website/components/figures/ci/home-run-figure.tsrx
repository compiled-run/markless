// CI's fast jobs at home, read from ci.yml.
import DeskFigure from '../ink/desk-figure.tsrx';
import { art } from './home-run.art.ts';

export default function HomeRunFigure() @{
	<DeskFigure
		art={art}
		label="Run it again"
		caption="A pen-and-ink drawing of ci.yml on a small sheet, with an arrow to a terminal running pnpm ci:local --fast. The summary it prints is ticked for the four fast jobs that passed: agent-files, typecheck, typecheck-ts7 and unit. The jobs it did not run, such as browser, perf-guards and test, are bracketed: they run on GitHub."
		said="The four fast jobs passed at home. Every other job runs on GitHub."
	/>
}
