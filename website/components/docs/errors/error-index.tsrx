import { Link } from '@markless/core/router';
import Sidebar from '../sidebar.tsrx';
import ThemeToggle from '../theme-toggle.tsrx';
import PageMeta from '../../page-meta.tsrx';
import { errorIndex } from './errors-index.ts';

export default function ErrorIndex() @{
	const groups = errorIndex.groups.map((group) => ({
		...group,
		id: group.packageName.replace(/^@/, '').replace(/[^a-z0-9]+/g, '-'),
		count: group.codes.length,
	}));
	const total = errorIndex.total;
	const guided = errorIndex.guided;

	<div class="error-index">
		<Sidebar pathname="/errors" />
		<h1>Error codes</h1>
		<PageMeta level="Reference" time="1 min" assumes="nothing" sprite="hash" />
		<ThemeToggle />
		<p class="summary">Every code Markless can print, grouped by the package that raises it.</p>
		<p>
			<span>Every Markless error starts with </span>
			<code>MARKLESS_</code>
			<span>
				{' '}
				and prints a link to its page here. Find your code below, or search the page for it.
			</span>
		</p>
		<p>
			<span>
				This list has {total} codes. {guided} of them have a written fix. The rest show the
				message and the files that raise it. New to the format? Read{' '}
			</span>
			<Link href="/tooling/diagnostics">how to read a Markless error</Link>
			<span> first.</span>
		</p>
		<ul class="jump" aria-label="Packages">
			@for (const group of groups; key group.id) {
				<li>
					<a href={'#' + group.id}>{group.packageName}</a>
					<span class="count">{group.count}</span>
				</li>;
			}
		</ul>
		@for (const group of groups; key group.id) {
			<section aria-labelledby={group.id}>
				<h2 id={group.id}>{group.packageName}</h2>
				<ul class="codes">
					@for (const item of group.codes; key item.code) {
						<li>
							<a href={`/errors/${item.code}`}>{item.code}</a>
							<span class="kind">{item.kind}</span>
							@if (
								item.guided
							) {
								<span class="guided">
									fix written
								</span>;
							}
						</li>;
					}
				</ul>
			</section>;
		}

		<style>
			.summary {
				max-width: 46ch;
				font-size: var(--step-1);
				line-height: 135%;
				opacity: 0.8;
			}

			.jump {
				display: flex;
				flex-wrap: wrap;
				gap: 0.5em;
				padding: 0;
				list-style: none;
			}

			.jump li {
				display: flex;
				gap: 0.4em;
				align-items: baseline;
				padding: 0.15em 0.7em;
				border: 2px solid var(--ink);
				border-radius: 999px;
				background: var(--raised);
			}

			.jump a {
				text-decoration: none;
			}

			.count {
				font-size: var(--step--1);
				opacity: 0.7;
			}

			.codes {
				padding: 0;
				list-style: none;
			}

			.codes li {
				display: flex;
				flex-wrap: wrap;
				gap: 0.2em 0.8em;
				align-items: baseline;
				padding-block: 0.45em;
				border-bottom: 1px solid var(--code-edge);
			}

			.codes a {
				font-family: var(--font-mono);
				font-size: var(--step--1);
				overflow-wrap: anywhere;
			}

			.kind {
				font-size: var(--step--1);
				opacity: 0.75;
			}

			.guided {
				padding: 0 0.5em;
				border-radius: 999px;
				background: var(--green-soft);
				color: var(--on-accent);
				font-size: var(--step--1);
			}
		</style>
	</div>;
}
