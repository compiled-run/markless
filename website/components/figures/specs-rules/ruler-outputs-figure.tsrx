// The .ruler/ sources, pnpm rules, and the files it writes.
import DeskFigure from '../ink/desk-figure.tsrx';
import { art } from './ruler-outputs.art.ts';

export default function RulerOutputsFigure() @{
	<DeskFigure
		art={art}
		label="Run pnpm rules again"
		caption="A pen-and-ink drawing of the .ruler/ folder holding AGENTS.md, claude.md, ruler.toml and skills/. An arrow runs into a terminal running pnpm rules, and from there to a sheet of what it writes: AGENTS.md, CLAUDE.md, the skill copies and the MCP configuration, each ticked. The sheet says never edit these by hand, and agent-files fails if they drift."
		said="pnpm rules wrote AGENTS.md, CLAUDE.md, the skill copies and the MCP configuration from .ruler/."
	/>
}
