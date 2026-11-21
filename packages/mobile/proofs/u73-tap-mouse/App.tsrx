import { state } from '@markless/core';

export default function App() @{
	let hovered = state('nothing');
	let left = state('nothing');
	let downs = state(0);
	<main>
		<h1>Fruit stand</h1>
		<ul onMousedown={() => downs++}>
			<li onMouseenter={() => (hovered = 'Apples')} onMouseleave={() => (left = 'Apples')}>Apples</li>
			<li onMouseenter={() => (hovered = 'Pears')} onMouseleave={() => (left = 'Pears')}>Pears</li>
		</ul>
		<p>Pointing at {hovered}</p>
		<p>Moved off {left}</p>
		<p>Pressed {downs} times</p>
	</main>
}
