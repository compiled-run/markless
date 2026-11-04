import type { Children } from '@markless/core';

export default function DocsShell({ section, children }: { readonly section: string; readonly children?: Children }) @{
	<div class="docs-shell" data-docs-shell data-section={section}>
		<aside class="docs-aside">
			<p class="docs-aside-note">{'Every page in the documentation shares this shell, its aside and its footer.'}</p>
			<p class="docs-aside-note">{'Only the section the page belongs to differs, and the page content in the middle.'}</p>
		</aside>
		<div class="docs-content" data-docs-content>{children}</div>
		<footer class="docs-footer">{'Found a problem with this page? Open an issue, or edit the page and send a pull request.'}</footer>
	</div>
}
