// A galley proof of the State page: its slug line is the file's path, and the path is the page's address.
import DeskFigure from '../ink/desk-figure.tsrx';
import { art } from './galley.art.ts';

export default function GalleyFigure() @{
	<DeskFigure
		art={art}
		label="Mark the proof again"
		caption="A pen-and-ink drawing of a galley proof lying in a wooden galley tray. The slug line at its head reads pages/concepts/state.mdx and is ringed, with = /concepts/state written beside it. The proof below shows the heading State is a variable the page watches. A nav.ts card beside it reads title: 'State' and href: '/concepts/state', marked sidebar, pager, head."
		said="The proof's slug line, pages/concepts/state.mdx, is the address /concepts/state, and its nav.ts card feeds the sidebar, the pager and the head."
	/>
}
