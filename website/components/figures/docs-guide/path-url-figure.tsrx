// A page file's path as its address, and its nav.ts entry feeding the sidebar.
import DeskFigure from '../ink/desk-figure.tsrx';
import { art } from './path-url.art.ts';

export default function PathUrlFigure() @{
	<DeskFigure
		art={art}
		label="Follow the page file again"
		caption="A pen-and-ink drawing of three sheets. A file sheet reads website/pages/concepts/state.mdx, and an arrow runs to a browser sheet at /concepts/state showing the heading State is a variable the page watches: the path is the address. A nav.ts sheet holds the entry with title State and href /concepts/state, and an arrow runs from its href to the same page: it feeds the sidebar, the pager and the document head."
		said="pages/concepts/state.mdx is served at /concepts/state, and its nav.ts entry feeds the sidebar, the pager and the head."
	/>
}
