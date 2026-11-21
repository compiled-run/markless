```ts
// src/memo.ts
import { startRecording, type Recording } from '@markless/device';

let active: Recording | undefined;
let timer: ReturnType<typeof setInterval> | undefined;

export async function begin(onTick: (seconds: number) => void) {
	active = await startRecording({ kind: 'audio' });
	const started = Date.now();
	timer = setInterval(() => onTick(Math.floor((Date.now() - started) / 1000)), 1000);
}

export async function end(): Promise<string> {
	clearInterval(timer);
	const recording = active;
	active = undefined;
	if (!recording) return '';
	const clip = await recording.stop();
	return clip.url;
}
```

```tsrx
import { state } from '@markless/core';
import { begin, end } from './memo.ts';

export default function Memo() @{
	let recording = state(false);
	let seconds = state(0);
	let clipUrl = state('');

	<section>
		@if (recording) {
			<>
				<p>{`Recording… ${seconds}s`}</p>
				<button onClick={async () => { recording = false; clipUrl = await end(); }}>Stop</button>
			</>
		} @else {
			<button
				onClick={async () => {
					seconds = 0;
					await begin((next) => (seconds = next));
					recording = true;
				}}
			>
				Record
			</button>
		}
		@if (clipUrl) {
			<audio controls src={clipUrl} />
		}
	</section>
}
```
