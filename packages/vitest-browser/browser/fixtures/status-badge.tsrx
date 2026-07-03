export function StatusBadge({ active }) @{
	<span class="badge">
		@if (active) { <em class="live">Live</em> } @else { <em class="idle">Idle</em> }
	</span>
}
