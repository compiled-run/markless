// The compiler's pass chain in run order, read from its registry at build time.
import { passLines } from './passes.ts';

export default function PassList() @{
	<div class="passes">
		<ol class="pass-list">
			@for (const pass of passLines; key pass.id) {
				<li>
					<code>{pass.id}</code>
					<span>{pass.does}</span>
				</li>
			}
		</ol>
		<style>
			.pass-list {
				display: grid;
				gap: 0.35rem;
				margin: var(--space-s) 0 var(--space-m);
				padding-inline-start: 1.6rem;
			}

			.pass-list li {
				display: grid;
				gap: 0.1rem;
			}
		</style>
	</div>
}
