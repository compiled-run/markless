// The sibling projects, as their mascots. versionless has no public repository
// yet, so its link points at the compiled-run organisation as a placeholder.
import Mascot from '../mascot.tsrx';

export default function MoreFromCompiled() @{
	<aside class="more-from">
		<style>
			.more-from {
				margin-top: var(--space-xl);
				padding-top: var(--space-m);
				border-top: 2px dashed var(--code-edge);
			}

			.more-from-title {
				margin: 0 0 var(--space-s);
				font-size: var(--step-0);
				text-transform: uppercase;
				letter-spacing: 0.08em;
				opacity: 0.75;
			}

			.more-from-list {
				display: grid;
				grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
				gap: var(--space-s);
				margin: 0;
				padding: 0;
				list-style: none;
			}

			.more-from-link {
				display: flex;
				flex-direction: column;
				gap: 0.2em;
				align-items: center;
				padding: var(--space-xs) 0.4em;
				color: var(--ink);
				text-align: center;
				text-decoration: none;
				border: 2px solid transparent;
				border-radius: 2px;
			}

			.more-from-link:hover {
				border-color: var(--ink);
				background: var(--raised);
			}

			.more-from-name {
				font-weight: 700;
			}

			.more-from-note {
				font-size: var(--step--2);
				opacity: 0.7;
			}
		</style>
		<p class="more-from-title">More from compiled.run</p>
		<ul class="more-from-list">
			<li class="more-from-item">
				<a class="more-from-link" href="https://github.com/compiled-run/markless">
					<Mascot name="markless" size="4.5rem" alt="The markless mascot" />
					<span class="more-from-name">markless</span>
					<span class="more-from-note">this site</span>
				</a>
			</li>
			<li class="more-from-item">
				<a class="more-from-link" href="https://compiled.run/guessless">
					<Mascot name="guessless" size="4.5rem" alt="The guessless mascot" />
					<span class="more-from-name">guessless</span>
					<span class="more-from-note">receipts, not guesses</span>
				</a>
			</li>
			<li class="more-from-item">
				<a class="more-from-link" href="https://github.com/compiled-run/frameless">
					<Mascot name="frameless" size="4.5rem" alt="The frameless mascot" />
					<span class="more-from-name">frameless</span>
					<span class="more-from-note">on GitHub</span>
				</a>
			</li>
			<li class="more-from-item">
				<a class="more-from-link" href="https://github.com/compiled-run">
					<Mascot name="versionless" size="4.5rem" alt="The versionless mascot" />
					<span class="more-from-name">versionless</span>
					<span class="more-from-note">no public repo yet</span>
				</a>
			</li>
		</ul>
	</aside>
}
