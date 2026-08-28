import { gauge } from './family/gauge.tsrx';
import { rosterOf } from './report.ts';

// The case no suite covered: an OUTERMOST page adopts a handle-carrying family
// and resolves it itself. Nothing encloses this page, so no other component can
// root the family - the page is the root, and its own writes must re-derive.
export default function OutermostPage() @{
	const g = gauge();

	<section data-outermost-page data-roster={g.roster}>
		<output data-page-loud>{g.loud}</output>
		<button type="button" data-mark data-name="a" el={g.marks}>a</button>
		<button
			type="button"
			data-write
			onClick={() => {
				g.label = 'louder';
			}}
		>write</button>
		<button
			type="button"
			data-probe
			onClick={() => {
				g.roster = rosterOf(g.marks);
			}}
		>probe</button>
	</section>
}
