import { state } from '@markless/core';
import { native, platform } from '@markless/device';
import { drawer } from '@markless/ui';

export default function App() @{
	let ownOpen = state(false);
	let systemOpen = state(false);
	let last = state('nothing');
	<main>
		<style>
			.own {
				background: #fffaf0;
				border-top: 4px solid #e07a1f;
				border-radius: 18px 18px 0 0;
				padding: 12px 20px 28px;
			}
		</style>
		<h1>Two sheets</h1>
		<p>Last closed: {last}</p>
		<drawer.root
			open={ownOpen}
			onChange={(open) => {
				ownOpen = open;
				if (!open) last = 'the drawer';
			}}
		>
			<drawer.trigger>Open the drawer</drawer.trigger>
			<drawer.backdrop>
				<drawer.content class="own">
					<drawer.title>Drawn by the app</drawer.title>
					<drawer.close>Close the drawer</drawer.close>
				</drawer.content>
			</drawer.backdrop>
		</drawer.root>
		<button onClick={() => (systemOpen = true)}>Open the system sheet</button>
		@if (!platform.web) {
			<native.sheet
				open={systemOpen}
				onChange={(open) => {
					systemOpen = open;
					last = 'the system sheet';
				}}
			>
				<h2>Drawn by the platform</h2>
				<button
					onClick={() => {
						systemOpen = false;
						last = 'the system sheet';
					}}
				>
					Close the system sheet
				</button>
			</native.sheet>
		} @else {
			<p>On the web, only the drawer</p>
		}
	</main>
}
