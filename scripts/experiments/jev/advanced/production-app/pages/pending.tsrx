import { computed, state } from '@markless/core';
import { Link } from '@markless/core/router';
export default function Pending() @{
  let count = state(0);
  const report = computed(async () => {
    await new Promise(resolve => setTimeout(resolve, 2000));
    return { title: 'Report ready' };
  });
  <main data-page="pending">
    <button data-testid="count" onClick={() => count++}>{count}</button>
    <Link href="/destination" data-testid="nav-destination">Leave pending work</Link>
    <section>
      @try {
        <p data-testid="report-ready">{report.title}</p>
      } @pending {
        <p data-testid="report-pending">Report loading</p>
      } @catch {
        <p data-testid="report-error">Report failed</p>
      }
    </section>
  </main>
}
