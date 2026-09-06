// The sibling projects, as their mascots. versionless has no public repository
// yet, so its link points at the compiled-run organisation as a placeholder;
// NOTES.md records that so the owner can swap it for the real one.
import Mascot from '../mascot.tsrx';

export default function MoreFromCompiled() @{
	<aside class="more-from">
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
