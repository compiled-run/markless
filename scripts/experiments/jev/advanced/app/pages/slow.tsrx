import { computed, state } from '@markless/core';
import Nav from '../components/nav.tsrx';
export default function Report() @{
  let count = state(0);
  const result = computed(async () => {
    await new Promise(resolve => setTimeout(resolve, 350));
    return 'Report ready';
  });
  <main data-page="slow">
    <Nav />
    <h1>Pending report</h1>
    <button data-testid="count" onClick={() => count++}>{count}</button>
    <section>
      @try {
        <p data-testid="report-ready">{result}</p>
      } @pending {
        <p data-testid="report-pending">Report loading</p>
      } @catch {
        <p data-testid="report-error">Report failed</p>
      }
    </section>
  </main>
}
