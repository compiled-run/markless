import { state } from '@markless/core';
import { Link } from '@markless/router';

export default function Settings() @{
	let on = state(false);
	<main class="settings">
		<style>
			.settings {
				padding: 24px;
				background: #fdfcf9;
			}
			.heading {
				font-size: 26px;
				font-weight: 700;
				color: #264653;
			}
			.toggle {
				display: block;
				width: 100%;
				margin-top: 16px;
				padding: 12px 16px;
				border: 2px solid #264653;
				border-radius: 10px;
				background: #ffffff;
				color: #264653;
				font-family: inherit;
				font-size: 18px;
				text-align: left;
			}
			.toggle.on {
				background: #264653;
				color: #ffffff;
			}
			.status {
				margin-top: 12px;
				padding: 10px 16px;
				background: #e9ecef;
				color: #495057;
				font-size: 16px;
			}
			.status[ui-active] {
				background: #2a9d8f;
				color: #ffffff;
			}
			.next {
				display: block;
				margin-top: 16px;
				color: #264653;
				font-size: 17px;
				text-decoration: none;
			}
			@media (prefers-color-scheme: dark) {
				.settings {
					background: #1d1b16;
				}
				.heading {
					color: #f4f1ea;
				}
				.next {
					color: #e9c46a;
				}
			}
		</style>
		<title>Settings</title>
		<h1 class="heading">Notifications</h1>
		<button class={on ? 'toggle on' : 'toggle'} onClick={() => (on = !on)}>
			{on ? 'Alerts on' : 'Alerts off'}
		</button>
		<p class="status" ui-active={on}>Daily summary</p>
		<Link class="next" href="/help">Open help</Link>
	</main>
}
