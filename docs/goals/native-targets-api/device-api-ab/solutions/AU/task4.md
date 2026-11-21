```tsrx
import { state } from '@markless/core';
import { vibrate } from '@markless/device';

export default function Like() @{
	let likes = state(0);

	<button onClick={() => { likes++; vibrate(10); }}>{`♥ ${likes}`}</button>
}
```
