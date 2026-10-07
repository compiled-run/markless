import { state } from '@markless/core';

export default function Groceries() @{
	let items = state([
		{ id: 'pears', name: 'Pears', done: false },
		{ id: 'coffee', name: 'Coffee', done: false },
		{ id: 'milk', name: 'Milk', done: false },
	]);

	<div>
		<ul>
			@for (const item of items; key item.id) {
				<li>
					<label>
						<input
							type="checkbox"
							checked={item.done}
							onChange={() => (item.done = !item.done)}
						/>
						{item.name}
					</label>
				</li>
			}
		</ul>
		<button onClick={() => (items = [...items].reverse())}>
			Reverse
		</button>
		<style>
			ul {
				margin: 0 0 0.6rem;
				padding: 0;
				list-style: none;
			}

			li {
				margin: 0.2rem 0;
				font-size: var(--step-1);
			}

			label {
				display: inline-flex;
				gap: 0.5rem;
				align-items: center;
				cursor: pointer;
			}

			input {
				width: 1.1rem;
				height: 1.1rem;
				accent-color: var(--green-star);
			}

			button {
				font-size: var(--step-0);
				padding: 0.3em 0.9em;
				color: var(--on-accent);
				background: var(--green-soft);
				border: 2px solid var(--ink);
				border-radius: 2px;
				box-shadow: 3px 3px 0 var(--ink);
				cursor: pointer;
			}

			button:active {
				transform: translate(3px, 3px);
				box-shadow: none;
			}
		</style>
	</div>
}
