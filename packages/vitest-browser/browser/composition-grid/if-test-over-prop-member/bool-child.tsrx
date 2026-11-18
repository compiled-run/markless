export default function BoolChild({ value }: { value: { big: boolean; n: number } }) @{
	<div>
		@if (value.big) {
			<p data-r>big {value.n}</p>
		} @else {
			<p data-r>small {value.n}</p>
		}
	</div>
}
