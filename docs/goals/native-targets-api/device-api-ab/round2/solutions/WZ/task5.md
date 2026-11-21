```tsrx
// file: task5/Memo.tsrx
import { recorder } from '@markless/device';

export default function Memo() @{
	const rec = recorder.handle();

	<recorder.root handle={rec}>
		<recorder.trigger>{rec.recording ? 'Stop' : 'Record'}</recorder.trigger>
		@if (rec.recording) {
			<p>
				<recorder.label /> s
			</p>
		}
		<recorder.error>
			<p>Microphone access is off.</p>
		</recorder.error>
		@if (rec.clip) {
			<audio controls src={rec.clip.url} />
		}
	</recorder.root>
}
```
