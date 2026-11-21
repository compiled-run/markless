```tsrx
// file: task5/Memo.tsrx
import { state } from '@markless/core';
import { device, type Clip } from '@markless/device';

export default function Memo() @{
	let recording = state(false);
	let seconds = state(0);
	let clip = state<Clip | null>(null);
	let denied = state(false);

	<section>
		<device.recorder
			active={recording}
			onTick={(whole) => (seconds = whole)}
			onChange={(next) => (clip = next)}
			onDenied={() => {
				denied = true;
				recording = false;
			}}
		/>
		<button
			disabled={denied}
			onClick={() => {
				if (!recording) seconds = 0;
				recording = !recording;
			}}
		>{recording ? 'Stop' : 'Record'}</button>
		@if (recording) {
			<p>{`${seconds} s`}</p>
		}
		@if (denied) {
			<p>Microphone access is off.</p>
		}
		@if (clip) {
			<audio controls src={clip.url} />
		}
	</section>
}
```
