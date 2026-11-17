```tsrx
// file: task5/Memo.tsrx
import { recorder } from '@markless/device';

export default function Memo() @{
	const rec = recorder();

	<section>
		<button
			onClick={() => {
				if (rec.recording) rec.stop();
				else void rec.start();
			}}
		>
			{rec.recording ? 'Stop' : 'Record'}
		</button>
		@if (rec.recording) {
			<p>{`${rec.seconds} s`}</p>
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
