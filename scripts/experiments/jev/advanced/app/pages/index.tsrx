import { state } from '@markless/core';
import Nav from '../components/nav.tsrx';
export default function Overview() @{
  let count = state(0);
  <main data-page="home">
    <Nav />
    <h1>Project overview</h1>
    <button data-testid="count" onClick={() => count++}>{count}</button>
  </main>
}
