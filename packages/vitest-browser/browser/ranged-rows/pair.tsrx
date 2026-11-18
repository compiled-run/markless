// A row component whose template is two elements side by side: the row is everything between its row comments.
export function Pair({
	pair,
}: {
	readonly pair: { readonly id: string; readonly term: string; readonly def: string };
}) @{
	<>
		<dt data-cterm={pair.id}>{pair.term}</dt>
		<dd data-cdef={pair.id}>{pair.def}</dd>
	</>
}
