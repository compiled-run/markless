import { state } from '@markless/core';
import { checkbox, toggle } from '@markless/ui';

export default function App() @{
	let sent = state('Nothing saved');
	let wifi = state(false);
	let bluetooth = state(true);
	<main>
		<h1>Preferences</h1>
		<form
			onSubmit={(event) => {
				event.preventDefault();
				const data = new FormData(event.currentTarget);
				sent = `Wi-Fi ${String(data.get('wifi'))}, Bluetooth ${String(data.get('bluetooth'))}, terms ${String(data.get('terms'))}`;
			}}
		>
			<toggle.root name="wifi" value="yes" onChange={(next) => (wifi = next)}>
				<toggle.label>Wi-Fi</toggle.label>
				<toggle.trigger>
					<toggle.thumb />
				</toggle.trigger>
				<toggle.field />
			</toggle.root>
			<toggle.root name="bluetooth" checked onChange={(next) => (bluetooth = next)}>
				<toggle.label>Bluetooth</toggle.label>
				<toggle.trigger>
					<toggle.thumb />
				</toggle.trigger>
				<toggle.field />
			</toggle.root>
			<checkbox.root name="terms">
				<checkbox.trigger aria-label="Accept terms">
					<checkbox.indicator>Accepted</checkbox.indicator>
				</checkbox.trigger>
				<checkbox.field />
			</checkbox.root>
			<button type="submit">Save</button>
		</form>
		<p>{wifi ? 'Wi-Fi is on' : 'Wi-Fi is off'}</p>
		<p>{bluetooth ? 'Bluetooth is on' : 'Bluetooth is off'}</p>
		<p>{sent}</p>
	</main>
}
