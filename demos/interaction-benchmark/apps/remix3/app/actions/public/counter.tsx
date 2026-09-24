import { clientEntry, on, type Handle } from 'remix/ui'

import { COUNTER_INITIAL } from '../../shared/data.ts'

export const Counter = clientEntry(import.meta.url, function Counter(handle: Handle) {
  let count = COUNTER_INITIAL

  return () => (
    <>
      <output className="value" data-testid="counter-value">
        {count}
      </output>
      <button
        type="button"
        className="button"
        data-testid="counter-increment"
        mix={on('click', () => {
          count++
          handle.update()
        })}
      >
        Increment
      </button>
    </>
  )
})
