const label = (route: string) => `${route}!`;

export default function RangePanel({
	route,
	from,
	to,
}: {
	readonly route: string;
	readonly from: number;
	readonly to: number;
}) @{
	<section>
		@if (from <= 0) {
			<div data-panel id={label(route)} title={route.toUpperCase()}>{label(route)}</div>
		} @else {
			<p data-other>other</p>
		}
		@if ((from ?? 0) <= 1 && 1 < (to ?? 3)) {
			<b data-range aria-label={label(route)}>in range</b>
		}
	</section>
}
