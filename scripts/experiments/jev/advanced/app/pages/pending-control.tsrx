import { computed, state } from '@markless/core';
import { Link } from '@markless/core/router';
export default function PendingControl() @{
  let count = state(0);
  const report = computed(async () => {
    await new Promise(resolve => setTimeout(resolve, 1200));
    return 'Report ready';
  });
  <main data-page="pending-control">
    <Link href="/plain" data-testid="nav-plain">Leave pending work</Link>
    <button data-testid="count" onClick={() => count++}>{count}</button>
    <section>
      @try {
        <p data-testid="report-ready">{report}</p>
      } @pending {
        <p data-testid="report-pending">Loading report</p>
      } @catch {
        <p data-testid="report-error">Report failed</p>
      }
    </section>
  </main>
}
