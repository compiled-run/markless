```tsrx
import { state } from '@markless/core';
import { haptic } from '@markless/device';

export default function Like() @{
	let likes = state(0);

	<button onClick={() => { likes++; haptic('light'); }}>{`♥ ${likes}`}</button>
}
```
