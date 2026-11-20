import { state } from '@markless/core';

export default function App() @{
	let size = state('m');
	let fired = state('nothing');
	<main>
		<h1>Sizes</h1>
		<select
			aria-label="Size"
			onInput={(event) => (fired = `input ${event.target.value}`)}
			onChange={(event) => {
				size = (event.target as HTMLSelectElement).value;
				fired = `${fired}, change ${size}`;
			}}
		>
			<option value="s">Small</option>
			<option value="m" selected>
				Medium
			</option>
			<option value="l">Large</option>
		</select>
		<select aria-label="Copy" value={size}>
			<option value="s">Small copy</option>
			<option value="m">Medium copy</option>
			<option value="l">Large copy</option>
		</select>
		<button onClick={() => (size = 'm')}>Reset</button>
		<p>Size is {size}</p>
		<p>Fired {fired}</p>
	</main>
}
