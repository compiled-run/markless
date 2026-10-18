/** A small torn paper note with a short link, the same paper as the code snippets' torn strip. */
export default function JumpNote({ lead, link, href }: { readonly lead: string; readonly link: string; readonly href: string }) @{
	<p class="jump torn-strip">
		<span class="torn-art" aria-hidden="true">
			<span class="torn-cast">
				<span class="torn-below"></span>
				<span class="torn-beside"></span>
				<span class="torn-corner"></span>
			</span>
			<span class="torn-middle"></span>
			<span class="torn-band torn-upper"></span>
			<span class="torn-band torn-lower"></span>
			<span class="torn-ends"></span>
		</span>
		<span class="words">
			{lead + ' '}
			<a href={href}>{link}</a>
		</span>
		<style>
			.jump {
				width: fit-content;
				/* Leaves room for the cast shadow that hangs 26px past the right edge. */
				box-sizing: border-box;
				max-width: calc(100% - 20px);
				margin: var(--space-l) auto;
				padding: 1.1rem 1.6rem 1.7rem;
				rotate: -0.8deg;
			}

			.words {
				position: relative;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-1);
			}

			.words a {
				font-weight: 700;
			}
		</style>
	</p>
}
