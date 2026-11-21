```tsrx
// file: task5/Memo.tsrx
import { state } from '@markless/core';
import { recorder } from '@markless/device';

export default function Memo() @{
	const rec = recorder();
	let refused = state(false);

	<section>
		<button
			onClick={() => {
				if (rec.recording) rec.stop();
				else rec.start().catch((error: Error) => (refused = error.name === 'NotAllowedError'));
			}}
		>
			{rec.recording ? 'Stop' : 'Record'}
		</button>
		@if (rec.recording) {
			<p>{`${rec.elapsed} s`}</p>
		}
		@if (refused) {
			<p>Microphone access is off.</p>
		}
		@if (rec.clip) {
			<audio controls src={rec.clip.url} />
		}
	</section>
}
```
