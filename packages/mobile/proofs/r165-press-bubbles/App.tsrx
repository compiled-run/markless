import { state } from '@markless/core';

export default function App() @{
	let log = state('start');
	<main>
		<h1>Bubbling</h1>
		<div onClick={() => (log = `${log}>card`)}>
			<p>Card body</p>
			<button onClick={() => (log = `${log}>button`)}>Inner</button>
			<button
				onClick={(event) => {
					event.stopPropagation();
					log = `${log}>stopped`;
				}}
			>
				Stop
			</button>
		</div>
		<p>{log}</p>
	</main>
}
