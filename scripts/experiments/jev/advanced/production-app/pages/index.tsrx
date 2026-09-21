import { state } from '@markless/core';
import { Link } from '@markless/core/router';
export default function Home() @{
  let count = state(0);
  <main data-page="home">
    <button data-testid="count" onClick={() => count++}>{count}</button>
    <Link href="/pending" data-testid="nav-pending">Pending report</Link>
    <Link href="/destination" data-testid="nav-destination">Destination</Link>
  </main>
}
