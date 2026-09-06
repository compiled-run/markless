import { state } from '@markless/core';

// An illustration, not a measurement. Each step is one sentence about what the
// browser is holding at that moment during a streamed server render. Text
// bindings rather than a record lookup: see NOTES.md finding 31.
export default function StreamSteps() @{
	let step = state(0);

	<section class="explorer">
		<div class="playground-controls">
			<button type="button" class="pick" onClick={() => step = Math.min(step + 1, 3)}>
				Step forward
			</button>
			<button type="button" class="pick" onClick={() => step = 0}>
				Back to the start
			</button>
		</div>
		<p class="playground-output">
			{step === 0 ? 'Request' : step === 1 ? 'First flush' : step === 2 ? 'Appended' : 'Committed'}
		</p>
		<p class="explorer-note">
			{step === 0
				? 'Nothing yet. The request has just arrived at the server.'
				: step === 1
					? 'The document is flushed. Everything fast is on the screen, and the slow boundary is showing its @pending arm.'
					: step === 2
						? 'The slow work settles. The server appends the settled arm to the same response as an inert template.'
						: 'The template is moved into the boundary and its records register. The settled content is live.'}
		</p>
	</section>
}
