import { state } from '@markless/core';

const TAGS = ['Work', 'Home', 'Ideas'];

export default function Tagging() @{
	let tag = state('Home');
	<main class="tagging">
		<style>
			.tagging {
				padding: 24px;
			}
			h1 {
				font-size: 28px;
				font-weight: 400;
			}
			.field {
				display: block;
				width: 100%;
				padding: 12px 14px;
				border: 1px solid #c9c2ad;
				border-radius: 10px;
				background: #fffdf7;
			}
			.plain {
				display: block;
				margin-top: 16px;
				width: 160px;
				appearance: none;
				border: 0;
				padding: 0;
			}
		</style>
		<title>Tagging</title>
		<h1>Tag a note</h1>
		<select
			class="field"
			aria-label="Tag"
			onChange={(event) => (tag = (event.target as HTMLSelectElement).value)}
		>
			@for (const option of TAGS; key option) {
				<option value={option} selected={option === tag}>
					{option}
				</option>
			}
		</select>
		<select class="plain" aria-label="Size">
			<option value="s">Small</option>
			<option value="l">Large</option>
		</select>
		<p>{`Tagged ${tag}`}</p>
	</main>
}
