```tsrx
import { state } from '@markless/core';
import { AudioRecorder, microphonePermission } from '@markless/device';

export default function Memo() @{
	const permission = microphonePermission();
	let recording = state(false);
	let seconds = state(0);
	let clipUri = state('');

	<section>
		@if (recording) {
			<div attach={() => AudioRecorder.addListener('progress', (status) => (seconds = status.seconds))}>
				<p>{`Recording… ${seconds}s`}</p>
				<button
					onClick={async () => {
						const clip = await AudioRecorder.stop();
						recording = false;
						clipUri = clip.uri;
					}}
				>
					Stop
				</button>
			</div>
		} @else {
			<button
				onClick={async () => {
					if (permission.state !== 'granted' && (await permission.request()) !== 'granted') return;
					seconds = 0;
					await AudioRecorder.start();
					recording = true;
				}}
			>
				Record
			</button>
		}
		@if (clipUri) {
			<audio controls src={clipUri} />
		}
	</section>
}
```
