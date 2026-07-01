import { state } from '@markless/core';

export function Counter() @{
  let count = state(0);

  <main>
    <h1>Markless macOS Proof</h1>
    <button onClick={() => count++}>Count {count}</button>
  </main>
}
