// A new app's package.json and the packages its four Markless packages bring along.
import DeskFigure from '../ink/desk-figure.tsrx';
import { art } from './packages.art.ts';

export default function PackagesFigure() @{
	<DeskFigure
		art={art}
		label="Show which packages you install again"
		caption="A pen-and-ink drawing of a new app's package.json. Its four Markless lines, @markless/core and @markless/router in dependencies and @markless/analyzer and @markless/typescript-plugin in devDependencies, are highlighted and bracketed: you install these. An arrow runs to a folder named @markless/ holding compiler, bundler, runtime, serializer and web: they come along, and you never import them."
		said="You install core, router, analyzer and typescript-plugin. compiler, bundler, runtime, serializer and web come along with them."
	/>
}
