import { Link } from '@markless/router';
import type { PageProps } from '@markless/router';

export default function Note({ params }: PageProps<{ id: string }>) @{
	<main class="note">
		<style>
			.note {
				padding: 24px;
				background: #ffffff;
				color: #1d1b16;
				font-size: 18px;
			}
			.title {
				margin: 0 0 12px;
				font-size: 26px;
				font-weight: 700;
			}
		</style>
		<h1 class="title">Note {params.id}</h1>
		<Link href="/">Back to notes</Link>
	</main>
}
