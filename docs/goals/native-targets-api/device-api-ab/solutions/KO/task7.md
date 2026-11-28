```tsrx
import { Notifications, notificationPermission } from '@markless/device';

export default function Remind({ orderId }: { orderId: string }) @{
	const permission = notificationPermission();

	<button
		attach={() => Notifications.addListener('tap', (notification) => location.assign(`/orders/${notification.data.orderId}`))}
		onClick={async () => {
			if (permission.state !== 'granted' && (await permission.request()) !== 'granted') return;
			await Notifications.schedule({
				title: 'Your order',
				body: `Order ${orderId} is on its way`,
				at: new Date(Date.now() + 30 * 60_000),
				data: { orderId },
			});
		}}
	>
		Remind me in 30 minutes
	</button>
}
```
In a real app the tap listener belongs in the app's root layout so it is registered on every page; it sits on the button here to keep the task in one file.
