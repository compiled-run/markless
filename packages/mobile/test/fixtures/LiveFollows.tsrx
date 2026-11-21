import { state } from '@markless/core';

export default function LiveFollows() @{
	let paused = state(false);
	let failed = state(false);
	let slide = state(1);
	<main>
		<p aria-live={paused ? 'off' : 'polite'}>{`Slide ${slide}`}</p>
		<div role={failed ? 'alert' : 'status'}>{failed ? 'Upload failed' : 'Upload saved'}</div>
		<button onClick={() => (slide = slide + 1)}>Next</button>
		<button onClick={() => (paused = !paused)}>Pause</button>
		<button onClick={() => (failed = !failed)}>Fail</button>
	</main>
}
