import { Link, type PageProps } from '@markless/router';

export default function Tag({ params }: PageProps<{ tag: string }>) @{
	<main class="tag">
		<style>
			.tag {
				padding: 24px;
				background: #eef4f1;
			}
			.title {
				margin: 0;
				font-size: 30px;
				font-weight: 700;
			}
			.note {
				margin-top: 12px;
				font-size: 17px;
			}
			.open {
				display: block;
				margin-top: 16px;
				padding: 12px 18px;
				border: 2px solid #1d1b16;
				border-radius: 12px;
				background: #ffd166;
				color: #1d1b16;
				font-size: 18px;
				text-decoration: none;
			}
		</style>
		<h1 class="title">{params.tag}</h1>
		<p class="note">Notes tagged here</p>
		<p class="note">Filed under {params.tag}</p>
		<Link href="/notes/[id]" params={{ id: 'trip' }} class="open">Open trip</Link>
	</main>
}
