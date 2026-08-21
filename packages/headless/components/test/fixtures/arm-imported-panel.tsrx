// A markup-only component in a file of its own: the page below shows it inside
// a flippable @if, so the flip rebuilds it from the markup this module compiled.
export function Panel({ label }) @{
	<span data-panel><b data-label>{label}</b></span>
}
