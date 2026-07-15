type M13BrokenValue =
	| { kind: 'label'; label: string }
	| { kind: 'count'; count: number };

export function M13Broken({ value }: { value: M13BrokenValue }) @{
	<div>
		@if (value.kind === 'label') {
			<span>{value.missing}</span>
		} @else {
			<span>{value.count}</span>
		}
	</div>
}
