import { state } from '@markless/core';
import { Link } from '@markless/router';

export default function Home() @{
	let notes = state<ReadonlyArray<string>>(['n1']);
	<main class="home">
		<style>
			.home {
				min-height: 100vh;
				width: 100%;
				max-width: 880px;
				margin: 0 auto;
				padding: 20px;
			}
			.bar {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 12px;
			}
			.pill {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				min-height: 44px;
				padding: 10px 18px;
				border: 1px solid #c2410c;
				border-radius: 999px;
				background: #c2410c;
				color: #ffffff;
				text-decoration: none;
				font-weight: 600;
			}
			.row {
				display: block;
				color: inherit;
				text-decoration: none;
			}
			h1 {
				margin: 0 0 16px;
				font-size: 28px;
				font-weight: 600;
				letter-spacing: -0.01em;
			}
		</style>
		<title>Home</title>
		<div class="bar">
			<span>Notes</span>
			<Link href="/new" class="pill">New note</Link>
		</div>
		@if (notes.length === 0) {
			<section>
				<h1>No notes yet</h1>
			</section>
		} @else {
			<h1>All notes</h1>
		}
		<Link href="/notes/[id]" params={{ id: 'n1' }} class="row">
			Groceries
		</Link>
	</main>
}
