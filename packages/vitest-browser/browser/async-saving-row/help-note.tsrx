import { state } from '@markless/core';

export default function HelpNote({ reason }: { reason: string }) @{
	let open = state(false);

	<aside>
		<button data-help onClick={() => (open = !open)}>Why?</button>
		@if (open) {
			<p data-saving>{reason}</p>
		}
	</aside>
}
