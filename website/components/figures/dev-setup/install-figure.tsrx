// The setup commands, and the git hooks pnpm install turns on.
import DeskFigure from '../ink/desk-figure.tsrx';
import { art } from './install.art.ts';

export default function InstallFigure() @{
	<DeskFigure
		art={art}
		label="Run the setup commands again"
		caption="A pen-and-ink drawing of a terminal sheet with four commands: git clone https://github.com/compiled-run/markless.git, cd markless, corepack enable and pnpm install. Under pnpm install, a note shows its prepare script: git config core.hooksPath .githooks. An arrow runs into a .githooks/ folder holding pre-commit, which runs lint and then CI's fast jobs, and pre-push, which uses gh."
		said="pnpm install ran prepare, which pointed git at .githooks, so pre-commit now runs lint and CI's fast jobs on every commit."
	/>
}
