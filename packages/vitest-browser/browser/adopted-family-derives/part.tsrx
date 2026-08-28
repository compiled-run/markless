import { gauge } from './family/gauge.tsrx';

// The ADOPTING module: it imports the family and roots nothing of its own. The
// part binds the family's factory computed and its handler writes the cell that
// computed derives from, so a dead derive chain shows up as a click that moves
// the cell and nothing else.
export function Mark({ name }) @{
	const g = gauge();

	<button
		type="button"
		data-mark
		data-name={name}
		data-mark-loud={g.loud}
		el={g.marks}
		onClick={() => {
			g.label = name;
		}}
	>{name}</button>
}

// Declared second, so it is not this module's render root: which component
// carries an adopted family's computed record follows the READ, not the
// module's first export.
export function Tick({ name }) @{
	const g = gauge();

	<button
		type="button"
		data-mark
		data-name={name}
		data-mark-loud={g.loud}
		onClick={() => {
			g.label = name;
		}}
	>{name}</button>
}
