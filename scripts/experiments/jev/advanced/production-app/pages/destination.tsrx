import { state } from '@markless/core';
import { Link } from '@markless/core/router';
export default function Destination() @{
  let count = state(0);
  <main data-page="destination">
    <button data-testid="count" onClick={() => count++}>{count}</button>
    <Link href="/" data-testid="nav-home">Home</Link>
    <Link href="/pending" data-testid="nav-pending">Pending report</Link>
  </main>
}
