```tsrx
import { showNotification, TimestampTrigger } from '@markless/device';

export default function Remind({ orderId }: { orderId: string }) @{
	<button
		onClick={() =>
			showNotification('Your order', {
				body: `Order ${orderId} is on its way`,
				navigate: `/orders/${orderId}`,
				showTrigger: new TimestampTrigger(Date.now() + 30 * 60_000),
			})
		}
	>
		Remind me in 30 minutes
	</button>
}
```
Config: `grants` includes `'notifications'` in `markless.config.ts`, with its usage text under `"notifications"` in `strings/permissions.json`.
