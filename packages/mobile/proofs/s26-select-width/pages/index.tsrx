import { state } from '@markless/core';

const TAGS = ['Work', 'Home', 'Ideas', 'Groceries'];

export default function Sizing() @{
	let tag = state('Home');
	<main class="sizing">
		<style>
			.sizing {
				padding: 24px;
			}
			.field {
				display: grid;
				gap: 6px;
				font-weight: 600;
			}
			.field select {
				width: 100%;
				padding: 12px 14px;
				border: 1px solid #c9c2ad;
				border-radius: 10px;
				background: #fffdf7;
				font-weight: 400;
			}
			.natural {
				display: block;
				margin-top: 16px;
				padding: 6px 8px;
				border: 1px solid #c9c2ad;
				background: #fffdf7;
			}
		</style>
		<title>Sizing</title>
		<label class="field">
			Category
			<select aria-label="Tag" onChange={(event) => (tag = (event.target as HTMLSelectElement).value)}>
				@for (const option of TAGS; key option) {
					<option value={option} selected={option === tag}>
						{option}
					</option>
				}
			</select>
		</label>
		<select class="natural" aria-label="Size">
			<option value="s">Small</option>
			<option value="l">Extra large</option>
		</select>
		<p>{`Tagged ${tag}`}</p>
	</main>
}
