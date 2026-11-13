export default function FlagChild({ value }: { value: { n: number } }) @{
	<div>
		@if (value.n > 1) {
			<p data-r>big {value.n}</p>
		} @else {
			<p data-r>small {value.n}</p>
		}
	</div>
}
