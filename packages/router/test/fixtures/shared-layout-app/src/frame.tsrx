import type { Children } from '@markless/core';

export default function Frame({ children }: { readonly children?: Children }) @{
	<section class="frame" data-frame aria-label="Guide">
		<nav class="frame-trail" aria-label="Breadcrumb">
			<span class="frame-step">{'Documentation / '}</span>
			<span class="frame-step">{'Guides / '}</span>
			<span class="frame-step">{'Navigation / '}</span>
			<span class="frame-step">{'Layouts / '}</span>
			<span class="frame-step">{'Shared parts / '}</span>
		</nav>
		<p class="frame-note">{'Reading the guide: every page in this section shares this frame and its trail.'}</p>
		<div class="frame-body" data-frame-body>{children}</div>
		<footer class="frame-footer">{'Edit this page, report a problem, or read the contribution guide for the docs.'}</footer>
	</section>
}
