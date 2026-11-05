// The four packages you install as nesting dolls, with core opened to show the packages inside.
import DeskFigure from '../ink/desk-figure.tsrx';
import { art } from './dolls.art.ts';

export default function DollsFigure() @{
	<DeskFigure
		art={art}
		label="Open the dolls again"
		caption="A pen-and-ink drawing of four nesting dolls on a shelf: core, router, typescript-plugin and analyzer, the four packages a new app installs. core stands split open, and beside it five smaller dolls stand in a row, each smaller than the last: bundler, compiler, web, runtime and serializer. analyzer is shut and holds nothing."
		said="You install core, router, typescript-plugin and analyzer. Opening core shows bundler, compiler, web, runtime and serializer. analyzer holds nothing."
	/>
}
