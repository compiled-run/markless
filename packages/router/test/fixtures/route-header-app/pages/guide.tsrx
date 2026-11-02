import SiteHeader from '../src/site-header.tsrx';
import DocsShell from '../src/docs-shell.tsrx';
import PageNote from '../src/page-note.tsrx';
import SectionField from '../src/section-field.tsrx';

export default function Page() @{
	<>
		<SiteHeader path="/guide" />
		<DocsShell section="guide">
			<main class="site-main" data-main="guide">
				<h1 data-title>{'Guide page'}</h1>
				<p>{'The guide page has its own content, which a navigation replaces.'}</p>
			</main>
		</DocsShell>
		<PageNote label="Guide" />
		<SectionField section="guide" />
	</>
}
