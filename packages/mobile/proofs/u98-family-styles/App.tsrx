import { Panel } from '../lib/FamilyPanel.tsrx';

export default function App() @{
	<main>
		<style>
			.top {
				height: 60px;
				font-size: 18px;
			}
		</style>
		<h1>Family styles</h1>
		<div class="top">Top row</div>
		<Panel />
	</main>
}
