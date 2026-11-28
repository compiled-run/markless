```tsrx
// file: task5/Memo.tsrx
import { recorder } from '@markless/device';

export default function Memo() @{
	const rec = recorder();

	<section>
		<recorder.trigger of={rec}>{rec.recording ? 'Stop' : 'Record'}</recorder.trigger>
		@if (rec.recording) {
			<p>
				<recorder.label of={rec} /> s
			</p>
		}
		@if (rec.denied) {
			<p>Microphone access is off.</p>
		}
		@if (rec.clip) {
			<audio controls src={rec.clip.url} />
		}
	</section>
}
```
