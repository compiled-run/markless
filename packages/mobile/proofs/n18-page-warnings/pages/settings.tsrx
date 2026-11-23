import { storage } from '@markless/core';
import { select, toggle } from '@markless/ui';

export default function Settings() @{
	let reminder = storage('reminder', 'off');
	let site = storage('site', 'North yard');
	<main>
		<title>Settings</title>
		<h1>Settings</h1>
		<toggle.root checked={reminder === 'on'} onChange={(next: boolean) => (reminder = next ? 'on' : 'off')}>
			<toggle.label>End-of-day reminder</toggle.label>
			<toggle.trigger>
				<toggle.thumb />
			</toggle.trigger>
		</toggle.root>
		<select.root name="site" value={site} onChange={(value: string) => (site = value)}>
			<select.label>Default site</select.label>
			<p>{site}</p>
			<select.trigger>Change site</select.trigger>
			<select.content>
				<select.item value="North yard">
					<select.itemlabel>North yard</select.itemlabel>
				</select.item>
				<select.item value="Pump house">
					<select.itemlabel>Pump house</select.itemlabel>
				</select.item>
				<select.item value="East fence">
					<select.itemlabel>East fence</select.itemlabel>
				</select.item>
			</select.content>
		</select.root>
	</main>
}
