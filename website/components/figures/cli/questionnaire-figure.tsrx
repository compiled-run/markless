// The create command, and the CLI's questions already answered by its flags.
import DeskFigure from '../ink/desk-figure.tsrx';
import { art } from './questionnaire.art.ts';

export default function QuestionnaireFigure() @{
	<DeskFigure
		art={art}
		label="Answer the questions again"
		caption="A pen-and-ink drawing of a terminal sheet with npm create markless@latest my-app -- --yes --starter app --no-git. A slip marked -- says npm passes the rest on. Below lies the CLI's question card, Welcome to Markless, already filled in: What are you building today? Build an app is ringed, from --starter app. What should we call it? my-app is written in. Where should it run? Node, and Install dependencies now? Yes, are ticked by --yes. Initialize git? Yes is struck through and No is ringed, from --no-git. A stamp says --yes: no questions."
		said="Every question is answered by the command: Build an app, my-app, Node, install yes, and no git."
	/>
}
