export default function PresenceBranchPart({ disabled }) @{
	<span data-presence-branch>@if (disabled) { <b>blocked</b> } @else { <i>open</i> }</span>
}
