import { state } from '@markless/core';
import { native, platform } from '@markless/device';

export default function App() @{
	let showFilters = state(false);
	let closes = state(0);
	<main>
		<h1>Shop</h1>
		<p>Closed by the platform: {closes}</p>
		<button onClick={() => (showFilters = true)}>Show filters</button>
		@if (!platform.web) {
			<native.sheet
				open={showFilters}
				onChange={(open) => {
					showFilters = open;
					closes++;
				}}
			>
				<h2>Filters</h2>
				<p>Pull down to close</p>
				<button onClick={() => (showFilters = false)}>Done</button>
			</native.sheet>
		} @else {
			<p>On the web, filters open in a drawer</p>
		}
	</main>
}
