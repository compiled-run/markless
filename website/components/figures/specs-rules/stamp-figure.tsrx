// .ruler/ as a rubber stamp pressed onto every generated file by pnpm rules.
import DeskFigure from '../ink/desk-figure.tsrx';
import { art } from './stamp.art.ts';

export default function StampFigure() @{
	<DeskFigure
		art={art}
		label="Press the stamp again"
		caption="A pen-and-ink drawing of a rubber stamp marked .ruler/ above an inkpad labelled pnpm rules. Three sheets, AGENTS.md, CLAUDE.md and the skill copies, each carry the same imprint: from .ruler/, do not edit. On CLAUDE.md the imprint is smudged where someone edited it by hand, crossed out in red: agent-files fails."
		said="pnpm rules stamped the same imprint on AGENTS.md, CLAUDE.md and the skill copies. The hand-edited CLAUDE.md is smudged, and agent-files fails."
	/>
}
