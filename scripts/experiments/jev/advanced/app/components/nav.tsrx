import { Link } from '@markless/core/router';
export default function Nav() @{
  <nav data-testid="navigation">
    <Link href="/" data-testid="nav-home">Overview</Link>
    <Link href="/workspace" data-testid="nav-workspace">Workspace</Link>
    <Link href="/todos" data-testid="nav-todos">Tasks</Link>
    <Link href="/slow" data-testid="nav-slow">Pending report</Link>
  </nav>
}
