```tsrx
// file: task5/Like.tsrx
import { state } from '@markless/core';
import { haptics } from '@markless/device';

export default function Like() @{
	const buzz = haptics();
	let likes = state(0);

	<button
		onClick={() => {
			likes++;
			buzz.tap('light');
		}}
	>
		{`Like (${likes})`}
	</button>
}
```
