import { Link } from '@markless/core/router';
import Sidebar from '../sidebar.tsrx';
import ThemeToggle from '../theme-toggle.tsrx';
import BrowserFrame from '../browser-frame.tsrx';
import Sprite from '../../sprite.tsrx';
import { asset } from '../../../site-base.ts';
import { appView, findApp } from './view.ts';

export default function AppPage({ slug }: { readonly slug: string }) @{
	const found = findApp(slug);
	const view = found ? appView(found) : undefined;
	const app = view?.app;
	const inProgress = app?.status === 'in-progress';
	const links = view ? view.links : [];
	const facts = view ? view.facts : [];
	const rows = view ? view.rows : [];
	const checks = view ? view.checks : [];
	const accepted = view ? view.accepted : [];
	const gaps = view ? view.gaps : [];
	const red = view ? view.red : [];
	const extra = view ? view.extra : [];
	const missing = view ? view.missing : [];
	const roles = app?.signIn ?? false;

	<div class="app-page">
		<Sidebar pathname="/start/migrate" />
		<ThemeToggle />
		@if (view && app) {
			<>
				<p class="crumb">
					<Link href="/start/migrate">Apps being moved</Link>
					<span aria-hidden="true">/</span>
					<span>{app.name}</span>
				</p>
				<div class="head">
					<div class="title">
						<h1>{app.name}</h1>
						<span class={inProgress ? 'sticker' : 'sticker is-done'}>{inProgress ? 'In progress' : 'Done'}</span>
					</div>
					<ul class="facts">
						@for (const fact of facts; key fact.id) {
							<li>{fact.text}</li>
						}
					</ul>
				</div>

				<div class="hero">
					<BrowserFrame address={view.hostName}>
						<img
							class="shot"
							src={asset(app.shot)}
							alt={'The ' + app.name + ' home page, served by Markless'}
							width="800"
							height="500"
							decoding="async"
						/>
					</BrowserFrame>
					<div class="stat">
						<span class="tally">
							<span>Pages moved: <b>{view.pagesMoved}</b></span>
							<span>Checks passed: <b>{view.checksPassed}</b></span>
						</span>
						<span class="stat-label">JavaScript run at load, home page</span>
						<span class="stat-value">{view.headline}</span>
						<span class="stat-note">{view.summary}, checked {view.checkedOn}.</span>
						<span class={inProgress ? 'status is-progress' : 'status'}>{view.status}</span>
					</div>
				</div>

				<ul class="links">
					@for (const link of links; key link.id) {
						<li>
							<a class={link.main ? 'pill main' : 'pill'} href={link.href}>{link.label}</a>
						</li>
					}
				</ul>

				@if (missing.length) {
					<>
					<h2 id="not-moved-yet">Pages not moved yet</h2>
						<ul class="plain-list note">
							@for (const route of missing; key route) {
								<li class="path">{route}</li>
							}
						</ul>
						@if (view.missingMore) {
							<p class="note">And {view.missingMore} more in the full report.</p>
						}
				</>
				}

				<h2 id="before-and-after">Before and after, per route</h2>
				<p class="lede">
					{'Left of the arrow is the old app, right is Markless. Run at load is the JavaScript the browser executes while the page loads. Downloaded is what it fetches, whether or not it runs.'}
				</p>
				<div class="table-wrap">
					<table class="metrics">
						<thead>
							<tr>
								<th scope="col">Route</th>
								<th scope="col">Checks passed</th>
								<th scope="col">JavaScript downloaded</th>
								<th scope="col">JavaScript run at load</th>
							</tr>
						</thead>
						<tbody>
							@for (const row of rows; key row.id) {
								<tr>
									<th scope="row">
										<span class={row.routeClass}>{row.route}</span>
										<span class="row-note">{row.note}</span>
									</th>
									<td data-label="Checks passed">
										<span>{row.checks}</span>
										<span class="row-note">{row.green}</span>
									</td>
									<td class="num" data-label="JavaScript downloaded">{row.downloaded}</td>
									<td class="num run" data-label="JavaScript run at load">{row.runAtLoad}</td>
								</tr>
							}
						</tbody>
					</table>
				</div>
				<p class="note">{view.redirects}</p>
				<p class="note">
					<span>Downloaded: </span>
					<span>{app.downloadedBasis}.</span>
					<span>{" Run at load: measured by Chrome's code coverage, uncompressed."}</span>
					@if (roles) {
						<span> A page someone may not open sends them elsewhere, so its numbers are the page they land on.</span>
					}
				</p>
				@if (extra.length) {
					<>
					<p class="note">Also sent to the new app, with no page to compare:</p>
						<ul class="plain-list note">
							@for (const item of extra; key item.id) {
								<li>
									<code>{item.route}</code>
									<span>: {item.reason}</span>
								</li>
							}
						</ul>
				</>
				}

				@if (gaps.length || red.length) {
					<>
					<h2 id="known-gaps">{inProgress ? 'Known gaps' : 'Still red in the report'}</h2>
						@if (gaps.length) {
							<>
						<p class="lede">{"Each of these keeps a check red. The reason given is the porting agent's, waiting for a person to accept it or fix it."}</p>
								<ul class="cards-list">
									@for (const gap of gaps; key gap.id) {
										<li class="gap">
											<strong>{gap.title}</strong>
											<span>{gap.detail}</span>
										</li>
									}
								</ul>
					</>
						}
						<p class="note">What the published report still shows red, per route and check. The full report has every failure.</p>
						<ul class="plain-list note">
							@for (const item of red; key item.id) {
								<li>
									<span class="path">{item.route}</span>
									<span>{' ' + item.text}</span>
								</li>
							}
						</ul>
				</>
				}

				<h2 id="what-was-checked">What was checked</h2>
				<p class="lede">Every page was loaded in the old app and in Markless, at desktop and phone widths, and compared on each of these. Counts are pages that passed. Animations are not compared yet.</p>
				<ul class="checks">
					@for (const check of checks; key check.id) {
						<li>
							<span class="check-mark">
								<Sprite name={check.mark} size="1.25em" />
							</span>
							<span class="check-name">{check.name}</span>
							<span class="check-count">{check.passed}</span>
						</li>
					}
				</ul>

				@if (accepted.length) {
					<>
					<h2 id="accepted-differences">Accepted differences</h2>
						<p class="lede">Places the two apps differ on purpose, each with the reason it was accepted.</p>
						<ul class="cards-list">
							@for (const entry of accepted; key entry.id) {
								<li class="accepted">
									<span class="where">{entry.where}</span>
									<span>{entry.reason}</span>
								</li>
							}
						</ul>
				</>
				}

				<h2 id="licence">Original project</h2>
				<p>
					<span>{app.links.originalRepo ? 'Source: ' : 'Moved from the live site at '}</span>
					<a href={app.links.originalRepo ?? app.links.originalSite ?? app.links.old}>
						{app.links.originalRepo ?? app.links.originalSite ?? app.links.old}
					</a>
					<span>. Licence: {app.links.licence ?? 'not recorded in the migration log'}.</span>
				</p>
			</>
		} @else {
			<div class="missing">
				<h1>No app with that name</h1>
				<p>
					<Link href="/start/migrate">See every app being moved</Link>
				</p>
			</div>
		}
		<p class="back">
			<Link href="/start/migrate">Back to Migrating an existing app</Link>
		</p>

		<style>
			.crumb {
				display: flex;
				flex-wrap: wrap;
				gap: 0.4em;
				margin-bottom: var(--space-xs);
				font-size: var(--step--1);
				opacity: 0.8;
			}

			.title {
				display: flex;
				flex-wrap: wrap;
				gap: 0.4em 1em;
				align-items: center;
			}

			.title h1 {
				margin: 0;
			}

			.sticker {
				padding: 0.2em 0.8em;
				border: 2px solid var(--ink);
				border-radius: 999px;
				background: var(--yellow);
				box-shadow: 0 0 0 3px white, 2px 3px 0 3px color-mix(in srgb, var(--ink) 25%, transparent);
				color: var(--on-accent);
				font-size: var(--step--1);
				font-weight: 800;
				transform: rotate(-3deg);
			}

			.sticker.is-done {
				background: var(--green-star);
			}

			.facts {
				display: flex;
				flex-wrap: wrap;
				gap: 0.4em;
				margin: var(--space-xs) 0 0 !important;
				padding: 0;
				list-style: none;
			}

			.facts li {
				margin: 0;
				padding: 0.1em 0.7em;
				border: 1.5px solid var(--ink);
				border-radius: 999px;
				font-size: var(--step--1);
			}

			.facts li::before {
				content: none;
			}

			.hero {
				display: grid;
				grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
				gap: var(--space-s);
				align-items: stretch;
				margin-top: var(--space-m);
			}

			.shot {
				display: block;
				width: 100%;
				height: auto;
			}

			.stat {
				display: grid;
				align-content: center;
				gap: 0.35em;
				padding: 1em 1.2em;
				border: 1.5px solid var(--ink);
				border-radius: 14px;
				background: color-mix(in srgb, var(--green-star) 22%, var(--paper));
				box-shadow: 5px 5px 0 var(--muted-ink);
			}

			.stat span {
				line-height: 1.35;
			}

			.tally {
				display: grid;
				gap: 0.15em;
				margin-bottom: 0.5em;
				font-size: var(--step-0);
			}

			.tally b {
				font-family: var(--font-mono);
				font-weight: 800;
			}

			.stat-label {
				font-size: var(--step--1);
				opacity: 0.8;
			}

			.stat .stat-value {
				font-family: var(--font-mono);
				font-size: clamp(1.25rem, 1rem + 1vw, 1.9rem);
				font-weight: 800;
				line-height: 1.15;
				white-space: nowrap;
			}

			.stat-note {
				font-size: var(--step--1);
			}

			.status {
				margin-top: 0.4em;
				font-size: var(--step--1);
				font-weight: 700;
			}

			.status.is-progress {
				color: var(--ink);
			}

			.links {
				display: flex;
				flex-wrap: wrap;
				gap: 0.5em;
				margin: var(--space-s) 0 0 !important;
				padding: 0;
				list-style: none;
			}

			.links li {
				margin: 0;
			}

			.links li::before {
				content: none;
			}

			.pill {
				display: inline-block;
				padding: 0.3em 0.9em;
				border: 1.5px solid var(--ink);
				border-radius: 999px;
				background: var(--raised);
				color: var(--ink);
				font-size: var(--step--1);
				font-weight: 700;
				text-decoration: none;
			}

			.pill:hover,
			.pill:focus-visible {
				background: color-mix(in srgb, var(--yellow) 40%, var(--paper));
			}

			.pill.main {
				background: var(--pink);
				color: var(--on-accent);
			}

			.lede {
				max-width: 62ch;
			}

			.table-wrap {
				overflow-x: auto;
				border: 1.5px solid var(--ink);
				border-radius: 10px;
			}

			.metrics {
				display: table;
				width: 100%;
				margin: 0;
				border-collapse: collapse;
				font-size: var(--step--1);
			}

			.metrics th,
			.metrics td {
				padding: 0.5em 0.8em;
				line-height: 1.35;
				border-bottom: 1px solid color-mix(in oklch, var(--ink) 18%, transparent);
				text-align: left;
				vertical-align: top;
			}

			.metrics thead th {
				background: color-mix(in srgb, var(--yellow) 30%, var(--paper));
				font-weight: 700;
				white-space: nowrap;
			}

			.metrics tbody tr:last-child > * {
				border-bottom: 0;
			}

			.metrics tbody th {
				min-width: 9rem;
				font-weight: 400;
				text-transform: none;
				letter-spacing: normal;
			}

			.path {
				font-family: var(--font-mono);
				font-size: 0.92em;
				overflow-wrap: anywhere;
			}

			.row-note:empty {
				display: none;
			}

			.row-note {
				display: block;
				color: color-mix(in oklch, var(--ink) 68%, var(--paper));
				font-size: var(--step--2);
			}

			.num {
				font-family: var(--font-mono);
				white-space: nowrap;
			}

			.run {
				font-weight: 700;
			}

			.note {
				color: color-mix(in oklch, var(--ink) 75%, var(--paper));
				font-size: var(--step--1);
			}

			.note:empty {
				display: none;
			}

			.checks {
				display: grid;
				grid-template-columns: repeat(auto-fill, minmax(min(100%, 19rem), 1fr));
				gap: 0.4em 1.2em;
				padding: 0;
				list-style: none;
			}

			.checks li {
				line-height: 1.3;
				display: grid;
				grid-template-columns: auto 1fr auto;
				gap: 0.5em;
				align-items: center;
				margin: 0;
				padding-block: 0.25em;
				border-bottom: 1px dashed color-mix(in oklch, var(--ink) 25%, transparent);
			}

			.checks li::before {
				content: none;
			}

			.check-count {
				font-family: var(--font-mono);
				font-size: var(--step--1);
				white-space: nowrap;
			}

			.cards-list {
				display: grid;
				gap: 0.7em;
				padding: 0;
				list-style: none;
			}

			.cards-list li {
				line-height: 1.45;
				display: grid;
				gap: 0.25em;
				margin: 0;
				padding: 0.7em 0.95em;
				border: 1.5px solid var(--ink);
				border-radius: 10px;
				background: var(--raised);
			}

			.cards-list li::before {
				content: none;
			}

			.gap {
				border-left-width: 6px !important;
				border-left-color: var(--yellow) !important;
			}

			.accepted .where {
				font-size: var(--step--1);
				font-weight: 700;
				color: color-mix(in oklch, var(--ink) 75%, var(--paper));
			}

			.plain-list li {
				overflow-wrap: anywhere;
			}

			.back {
				margin-top: var(--space-l);
			}

			@media (max-width: 760px) {
				.hero {
					grid-template-columns: minmax(0, 1fr);
				}
			}

			@media (max-width: 600px) {
				.metrics,
				.metrics tbody,
				.metrics tr,
				.metrics th,
				.metrics td {
					display: block;
				}

				.metrics thead {
					display: none;
				}

				.metrics tr {
					padding: 0.5em 0.8em;
					border-bottom: 1px solid color-mix(in oklch, var(--ink) 18%, transparent);
				}

				.metrics tbody tr:last-child {
					border-bottom: 0;
				}

				.metrics tbody th,
				.metrics td {
					display: grid;
					grid-template-columns: 8.5em minmax(0, 1fr);
					gap: 0.5em;
					padding: 0.15em 0;
					border: 0;
				}

				.metrics tbody th {
					display: block;
					margin-bottom: 0.2em;
				}

				.metrics td::before {
					content: attr(data-label);
					color: color-mix(in oklch, var(--ink) 68%, var(--paper));
					font-family: 'Shantell Sans', system-ui, sans-serif;
					font-weight: 400;
				}

				.metrics td .row-note {
					grid-column: 2;
				}

				.num {
					white-space: normal;
				}
			}
		</style>
	</div>
}
