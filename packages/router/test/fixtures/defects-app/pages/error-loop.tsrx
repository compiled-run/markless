import { state } from '@markless/core';

export default function ErrorLoopPage() @{
	let errors = state(['too short', 'missing digit']);
	<main>
		<button type="button" data-clear onClick={() => (errors = errors.slice(1))}>clear</button>
		<ul data-errors>
			@for (const error of errors; key error) {
				<li>{error}</li>;
			}
		</ul>
	</main>;
}
