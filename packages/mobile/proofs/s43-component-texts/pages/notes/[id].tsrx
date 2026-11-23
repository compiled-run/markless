import { state } from '@markless/core';
import type { PageProps } from '@markless/router';
import { modal } from '@markless/ui';
import Heading from '../../lib/Heading.tsrx';

export default function Note({ params }: PageProps<{ id: string }>) @{
	let confirming = state(false);
	<main class="note">
		<style>
			.note {
				padding: 24px;
				background: #f8f9fa;
			}
			.button {
				display: block;
				margin-top: 16px;
				padding: 12px 18px;
				border: 2px solid #1d1b16;
				border-radius: 12px;
				background: #ffd166;
				color: #1d1b16;
				font: inherit;
				font-size: 18px;
			}
			.backdrop:not([hidden]) {
				position: fixed;
				inset: 0;
				display: grid;
				place-items: center;
				padding: 20px;
				background: rgb(0 0 0 / 0.45);
			}
			.dialog {
				display: grid;
				gap: 12px;
				width: min(420px, 100%);
				padding: 24px;
				border-radius: 12px;
				background: #ffffff;
			}
		</style>
		<Heading name={params.id} />
		<button type="button" class="button" onClick={() => (confirming = true)}>
			Delete
		</button>
		<modal.root open={confirming} onChange={(open: boolean) => (confirming = open)}>
			<modal.backdrop class="backdrop">
				<modal.content class="dialog">
					<modal.title>Delete this note?</modal.title>
					<modal.description>“{params.id}” will be gone for good.</modal.description>
					<modal.close class="button">Keep it</modal.close>
				</modal.content>
			</modal.backdrop>
		</modal.root>
	</main>
}
