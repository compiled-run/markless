```tsrx
// file: task6/Remind.tsrx
import { notify } from '@markless/device';

export default function Remind() @{
	<button onClick={() => notify({ title: 'Your order', body: 'Order 42 is ready.', at: new Date(Date.now() + 60 * 60 * 1000), url: '/orders/42' })}>
		Remind me in an hour
	</button>
}
```
