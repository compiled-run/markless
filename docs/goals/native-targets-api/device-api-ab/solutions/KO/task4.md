```tsrx
import { state } from '@markless/core';
import { Haptics } from '@markless/device';

export default function Like() @{
	let likes = state(0);

	<button onClick={() => { likes++; Haptics.impact('light'); }}>{`♥ ${likes}`}</button>
}
```
