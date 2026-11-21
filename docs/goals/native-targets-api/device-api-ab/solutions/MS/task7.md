```tsrx
import { notifications } from '@markless/device';

export default function Remind({ orderId }: { orderId: string }) @{
	const alerts = notifications();

	<button
		onClick={() =>
			alerts.schedule({
				title: 'Your order',
				body: `Order ${orderId} is on its way`,
				at: new Date(Date.now() + 30 * 60_000),
				url: `/orders/${orderId}`,
			})
		}
	>
		Remind me in 30 minutes
	</button>
}
```
