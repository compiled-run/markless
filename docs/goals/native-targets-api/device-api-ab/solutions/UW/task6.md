```tsrx
import { state } from '@markless/core';
import { recorder, type Clip } from '@markless/device';

export default function Memo() @{
	let clip = state<Clip | null>(null);

	<recorder.root onChange={(next: Clip) => (clip = next)}>
		<recorder.trigger>Start or stop recording</recorder.trigger>
		<recorder.indicator>Recording… <recorder.valuelabel />s</recorder.indicator>
		@if (clip) {
			<audio controls src={clip.url} />
		}
	</recorder.root>
}
```
