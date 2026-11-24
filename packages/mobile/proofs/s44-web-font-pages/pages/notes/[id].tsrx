import { computed } from '@markless/core';
import type { PageProps } from '@markless/router';

const notes = [{ id: 'n1', title: 'Groceries', body: 'Milk and eggs' }];

export default function Note({ params }: PageProps<{ id: string }>) @{
	const note = computed(() => notes.find((entry) => entry.id === params.id));
	<main class="page">
		<style>
			.page {
				min-height: 100vh;
				width: 100%;
				max-width: 880px;
				margin: 0 auto;
				padding: 20px;
			}
			.note {
				padding: 24px;
				border: 1px solid #e4ddcf;
				border-radius: 14px;
				background: #ffffff;
			}
			h1 {
				margin: 0 0 16px;
				font-size: 28px;
				font-weight: 600;
				letter-spacing: -0.01em;
			}
		</style>
		<title>Note</title>
		@if (note) {
			<article class="note">
				<h1>{note.title}</h1>
				<p>{note.body}</p>
			</article>
		} @else {
			<section>
				<h1>Note not found</h1>
			</section>
		}
	</main>
}
