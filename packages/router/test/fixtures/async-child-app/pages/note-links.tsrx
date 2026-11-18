import { Link } from '@markless/router';

export default function NoteLinks() @{
	<main>
		<Link id="to-direct" href="/note/direct/nav-direct?tab=info">Direct</Link>
		<Link id="to-framed" href="/note/framed/nav-framed?tab=info">Framed</Link>
		<Link id="to-deep" href="/note/deep/nav-deep?tab=info">Deep</Link>
		<Link id="to-opened" href="/note/opened/nav-opened?tab=info">Opened</Link>
	</main>
}
