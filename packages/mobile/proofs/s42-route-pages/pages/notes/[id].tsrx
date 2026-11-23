import type { PageProps } from '@markless/router';

const bodies: Record<string, readonly string[]> = {
	trip: ['Pack the warm coat.', 'Book the ferry to Bergen before Friday.'],
};

export default function Note({ params }: PageProps<{ id: string }>) @{
	const lines = bodies[params.id] ?? [];
	<main class="note">
		<style>
			.note {
				padding: 24px;
				background: #f8f9fa;
			}
			.title {
				margin: 0;
				font-size: 28px;
				font-weight: 700;
			}
			.line {
				margin: 12px 0 0;
				font-size: 17px;
			}
		</style>
		<h1 class="title">Trip</h1>
		@for (const line of lines; index i; key i) {
			<p class="line">{line}</p>
		}
	</main>
}
