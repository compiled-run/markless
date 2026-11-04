// The specs/ folder: the index on top, one file per area, the deferred list and the archive marked.
import DeskFigure from '../ink/desk-figure.tsrx';
import { art } from './specs-folder.art.ts';

export default function SpecsFolderFigure() @{
	<DeskFigure
		art={art}
		label="Mark up the specs folder again"
		caption="A pen-and-ink drawing of the specs/ folder open on a desk. On top lies framework-design.md, the index, labelled read first. Beneath it the framework files, 00-overview.md to 14-emission-codegen-migration.md, are bracketed as one area each. 08-deferred-decisions.md is ringed: open on purpose. framework/archive/ is struck through: history, not the contract. router/ sits at the bottom."
		said="Read framework-design.md first. Each framework file owns one area, 08-deferred-decisions.md lists open topics, and the archive is history."
	/>
}
