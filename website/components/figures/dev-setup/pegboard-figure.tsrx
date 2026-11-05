// A pegboard where pnpm install hangs each repo script, and a bell on the door for the git hooks.
import DeskFigure from '../ink/desk-figure.tsrx';
import { art } from './pegboard.art.ts';

export default function PegboardFigure() @{
	<DeskFigure
		art={art}
		label="Run pnpm install again"
		caption="A pen-and-ink drawing of a workshop pegboard with an outlined spot for each tool. After pnpm install, a tag hangs on each hook: typecheck, ci:local, test, lint, build, rules and docs:dev. On the door beside it hangs a bell on a string, labelled .githooks. When git commit goes out of the door, the bell rings: lint, then CI's fast jobs."
		said="pnpm install hung every script on the board and tied the .githooks bell to the door. A commit rings it: lint, then the fast jobs."
	/>
}
