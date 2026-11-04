// The create command on a terminal sheet, each part named in pen.
import DeskFigure from '../ink/desk-figure.tsrx';
import { art } from './create-command.art.ts';

export default function CreateCommandFigure() @{
	<DeskFigure
		art={art}
		label="Name each part of the command again"
		caption="A pen-and-ink drawing of a terminal sheet with npm create markless@latest my-app -- --yes --starter app --no-git typed on two lines. Pen notes name each part: my-app is the folder, -- makes npm pass the rest on, --yes takes the defaults with no questions, --starter app picks the app starter, and --no-git skips git init."
		said="my-app is the folder. -- makes npm pass the rest on. --yes takes the defaults. --starter app picks the app starter. --no-git skips git init."
	/>
}
