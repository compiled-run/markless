export function IntrinsicContractErrors() @{
	<div className="rejected">className</div>
	<div bogusAttribute="rejected">bogus</div>
	<div src="not-div-specific">specificity</div>
	<div>{{ invalid: 'child' }}</div>
	<div overlay onDismiss={(event) => { const only: 'escape' = event.detail.reason; }}>reason</div>
	<svg opacity={true} />
	<circle opacity={{ value: 0.5 }} />
	<div opacity={0.5}>not an SVG element</div>
	<td scope="col">header-only attribute</td>
}
