import { state } from '@markless/core';

const STROKE: Record<string, unknown> = { strokeWidth: 6, strokeLinecap: 'round' };

function Line(props: Record<string, unknown>) @{
	<line data-spread x1="0" y1="10" x2="40" y2="10" stroke="black" {...props} />
}

export default function Page() @{
	let width = state(2);
	let open = state(false);
	let rows = state([{ id: 'a', width: 5 }]);
	<div>
		<button data-grow tabIndex={0} onClick={() => (width = width + 1)}>grow</button>
		<button data-open onClick={() => (open = !open)}>open</button>
		<button data-add onClick={() => (rows = [...rows, { id: 'b', width: 7 }])}>add</button>
		<svg viewBox="0 0 40 40" width="40" height="40">
			<line data-static x1="0" y1="0" x2="40" y2="0" stroke="black" strokeWidth={4} fillOpacity="0.5" />
			<line data-live x1="0" y1="20" x2="40" y2="20" stroke="black" strokeWidth={width} />
			<line data-object x1="0" y1="30" x2="40" y2="30" stroke="black" {...STROKE} />
			<Line strokeWidth={8} strokeDasharray="2 2" />
			<g>
				@for (const row of rows; key row.id) {
					<line data-row={row.id} x1="0" y1="5" x2="40" y2="5" stroke="black" strokeWidth={row.width} />
				}
			</g>
			@if (open) {
				<line data-arm x1="0" y1="40" x2="40" y2="40" stroke="black" strokeWidth={width} />
			}
		</svg>
	</div>
}
