import { state } from '@markless/core';

export default function App() @{
	let touched = state('Not touched');
	let held = state('Nothing held');
	let count = state(0);
	<main>
		<ul>
			@for (const item of ['Milk', 'Bread']; key item) {
				<li
					onPointerdown={() => (touched = 'Touched ' + item)}
					onContextmenu={(event) => {
						event.preventDefault();
						held = 'Held ' + item;
					}}
				>
					{item}
				</li>
			}
		</ul>
		<p>{touched}</p>
		<p>{held}</p>
		<button onClick={() => count++}>Count {count}</button>
	</main>
}
