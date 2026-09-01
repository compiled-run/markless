// The line under a family's title: what the component is, in one breath. A
// component rather than a markdown paragraph because MDX rejects raw HTML, so a
// page has no other way to mark one paragraph as the subtitle.
export default function Subtitle({ text }: { readonly text: string }) @{
	<p class="page-subtitle">
		{text}

		<style>
			.page-subtitle {
				max-width: 46ch;
				margin-block: -0.2em var(--space-m);
				font-size: var(--step-1);
				line-height: 135%;
				opacity: 0.72;
			}
		</style>
	</p>
}
