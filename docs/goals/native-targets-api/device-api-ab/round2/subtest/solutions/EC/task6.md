```tsrx
// file: task6/Remind.tsrx
import { notifications } from '@markless/device';

export default function Remind() @{
	<button onClick={() => notifications.schedule({ title: 'Your order', body: 'Order 42 is ready.', at: new Date(Date.now() + 60 * 60 * 1000), url: '/orders/42' })}>
		Remind me in an hour
	</button>
}
```
