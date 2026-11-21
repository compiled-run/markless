```tsrx
import { state } from '@markless/core';
import { haptics } from '@markless/device';

export default function Like() @{
	const feel = haptics();
	let likes = state(0);

	<button onClick={() => { likes++; feel.tap('light'); }}>{`♥ ${likes}`}</button>
}
```
