```ts
// file: task7/clock.ts
export function clock(seconds: number): string {
	const whole = Math.floor(seconds);
	return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
```

```tsrx
// file: task7/Film.tsrx
import { state } from '@markless/core';
import { device } from '@markless/device';
import { clock } from './clock.ts';

export default function Film() @{
	let playing = state(false);
	let time = state(0);
	let duration = state(0);

	<section>
		<device.player
			src="/media/intro.mp4"
			playing={playing}
			time={time}
			onTimeChange={(seconds) => (time = seconds)}
			onDuration={(seconds) => (duration = seconds)}
			onEnd={() => (playing = false)}
		/>
		<button onClick={() => (playing = !playing)}>{playing ? 'Pause' : 'Play'}</button>
		<input type="range" min="0" max={duration} step="1" value={time} onInput={(event) => (time = Number(event.currentTarget.value))} />
		<p>{clock(time)}</p>
	</section>
}
```
