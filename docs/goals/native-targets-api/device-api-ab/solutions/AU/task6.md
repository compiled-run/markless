```ts
// src/memo.ts
import { getUserMedia, MediaRecorder } from '@markless/device';

let active: MediaRecorder | undefined;
let timer: ReturnType<typeof setInterval> | undefined;

export async function startMemo(onTick: (seconds: number) => void, onClip: (url: string) => void) {
	const stream = await getUserMedia({ audio: true });
	const chunks: Blob[] = [];
	active = new MediaRecorder(stream);
	active.ondataavailable = (event) => chunks.push(event.data);
	active.onstop = () => {
		stream.getTracks().forEach((track) => track.stop());
		onClip(URL.createObjectURL(new Blob(chunks)));
	};
	const started = Date.now();
	timer = setInterval(() => onTick(Math.floor((Date.now() - started) / 1000)), 1000);
	active.start();
}

export function stopMemo() {
	clearInterval(timer);
	active?.stop();
	active = undefined;
}
```

```tsrx
import { state } from '@markless/core';
import { startMemo, stopMemo } from './memo.ts';

export default function Memo() @{
	let recording = state(false);
	let seconds = state(0);
	let clipUrl = state('');

	<section>
		@if (recording) {
			<>
				<p>{`Recording… ${seconds}s`}</p>
				<button onClick={() => { stopMemo(); recording = false; }}>Stop</button>
			</>
		} @else {
			<button
				onClick={async () => {
					seconds = 0;
					await startMemo((next) => (seconds = next), (url) => (clipUrl = url));
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
Config: `grants` includes `'microphone'` in `markless.config.ts`, with its usage text under `"microphone"` in `strings/permissions.json`.
