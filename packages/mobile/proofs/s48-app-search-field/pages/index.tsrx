import { state } from '@markless/core';

export default function Search() @{
	let query = state('');
	<main class="page">
		<style>
			.page {
				padding: 24px;
				background: #fbf8f1;
				color: #1f1d1a;
			}
			.search {
				display: block;
				width: 100%;
				margin-bottom: 18px;
				padding: 12px 16px;
				border: 1px solid #e4ddcf;
				border-radius: 999px;
				background: #ffffff;
			}
			.tall {
				line-height: 1.45;
			}
		</style>
		<title>Search field</title>
		<input
			class="search"
			type="search"
			aria-label="Search notes"
			placeholder="Title or tag"
			value={query}
			onInput={(event) => (query = event.currentTarget.value)}
		/>
		@if (query === '') {
			<p>Nothing searched</p>
		} @else {
			<p>Searched</p>
		}
		<input class="search" type="search" aria-label="Saved search" value="Groceries" />
		<input class="search tall" type="search" aria-label="Tall search" placeholder="Name or date" />
	</main>
}
