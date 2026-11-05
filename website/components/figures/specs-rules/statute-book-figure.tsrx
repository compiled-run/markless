// specs/ as a bound book of statutes: a ribbon at the index, one chapter per area, a flag on the open decisions.
import DeskFigure from '../ink/desk-figure.tsrx';
import { art } from './statute-book.art.ts';

export default function StatuteBookFigure() @{
	<DeskFigure
		art={art}
		label="Open the book of specs again"
		caption="A pen-and-ink drawing of a bound book lying open on a desk. The left page reads specs/, then framework-design.md, the index, read first, with a ribbon bookmark lying across it; then router/, routing and typed routing; then archive/, struck through: history, not the contract. The right page lists the framework/ chapters, 00 overview to 14 emission and codegen, one area each, and a yellow flag marked open sticks out at 08 deferred decisions."
		said="The ribbon marks framework-design.md, the index. Each framework chapter owns one area, and 08 deferred decisions is flagged open."
	/>
}
