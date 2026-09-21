import { state } from '@markless/core';
import { Link } from '@markless/core/router';
export default function Plain() @{
  let count = state(0);
  <main data-page="plain"><h1>Plain route control</h1><button data-testid="count" onClick={() => count++}>{count}</button><Link href="/">Return</Link></main>
}
