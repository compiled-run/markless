import { state } from '@arcade/core';

export function Counter() @{
  let count = state(0);

  <main>
    <h1>Arcade iOS Proof</h1>
    <button onClick={() => count++}>Count {count}</button>
  </main>
}
