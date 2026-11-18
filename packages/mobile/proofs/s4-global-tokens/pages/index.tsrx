import { Link } from '@markless/router';

export default function Inbox() @{
	<main class="panel">
		<style>
			.note {
				margin-top: var(--gap);
				padding: 8px 12px;
				border-left: 4px solid var(--accent);
				color: var(--ink);
				font-size: 16px;
			}
		</style>
		<title>Inbox</title>
		<h1>Inbox</h1>
		<p class="note">Two messages wait.</p>
		<Link class="chip" href="/team">Open team</Link>
	</main>
}
