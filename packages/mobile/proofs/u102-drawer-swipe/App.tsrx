import { state } from '@markless/core';
import { drawer } from '@markless/ui';

export default function App() @{
	let open = state(false);
	let closes = state(0);
	<main>
		<style>
			.panel {
				width: 60%;
				background: #f3efff;
				border-left: 4px solid #6a4fd8;
				padding: 24px;
			}
		</style>
		<h1>Side drawer</h1>
		<p>Closed {closes} times</p>
		<drawer.root
			open={open}
			orientation="horizontal"
			onChange={(next) => {
				open = next;
				if (!next) closes = closes + 1;
			}}
		>
			<drawer.trigger>Open the panel</drawer.trigger>
			<drawer.backdrop>
				<drawer.close>Close the panel</drawer.close>
				<drawer.content class="panel">Swipe this panel away</drawer.content>
			</drawer.backdrop>
		</drawer.root>
	</main>
}
