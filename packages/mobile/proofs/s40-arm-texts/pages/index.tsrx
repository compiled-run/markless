import { state } from '@markless/core';

export default function Notes() @{
	let note = state<{ title: string } | null>(null);
	let lifted = state(false);
	<main class="page">
		<style>
			.page {
				padding: 24px;
				background: #f8f9fa;
			}
			.card {
				padding: 16px;
				border: 1px solid #ced4da;
				border-radius: 10px;
				background: #ffffff;
			}
			.title {
				margin: 0;
				font-size: 24px;
				font-weight: 700;
			}
			.lift {
				margin-top: 16px;
				padding: 12px;
				border: 1px solid #ced4da;
			}
			.button {
				display: block;
				margin-top: 12px;
				padding: 10px 16px;
				border: 1px solid #ced4da;
				border-radius: 10px;
				background: #ffffff;
				color: #212529;
				font-family: inherit;
				font-size: 17px;
			}
			.lift.up {
				border: 3px solid #264653;
			}
		</style>
		@if (note) {
			<article class="card">
				<h1 class="title">{note.title}</h1>
			</article>
		} @else {
			<section class="card">
				<p>No note open</p>
			</section>
		}
		<button class="button" onClick={() => (note = { title: 'Trip to Oslo' })}>Open note</button>
		<div class={lifted ? 'lift up' : 'lift'}>
			<p>{lifted ? 'Lifted' : 'Resting'}</p>
		</div>
		<button class="button" onClick={() => (lifted = !lifted)}>Lift</button>
	</main>
}
