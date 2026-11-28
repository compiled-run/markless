```tsrx
import { recorder } from '@markless/device';

export default function Memo() @{
	const rec = recorder();

	<section>
		@if (rec.recording) {
			<>
				<p>{`Recording… ${rec.elapsed}s`}</p>
				<button onClick={() => rec.stop()}>Stop</button>
			</>
		} @else {
			<button onClick={() => rec.start()}>Record</button>
		}
		@if (rec.clip) {
			<audio controls src={rec.clip.url} />
		}
	</section>
}
```
