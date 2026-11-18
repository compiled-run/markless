export default function BareChild({ n }: { n: number }) @{
	<div>
		@if (n > 1) {
			<p data-r>big {n}</p>
		} @else {
			<p data-r>small {n}</p>
		}
	</div>
}
