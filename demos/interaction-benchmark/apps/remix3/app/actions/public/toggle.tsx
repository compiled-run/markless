import { clientEntry, on, type Handle } from 'remix/ui'

import { toggleStatusText } from '../../shared/data.ts'

export const Toggle = clientEntry(import.meta.url, function Toggle(handle: Handle) {
  let pressed = false

  return () => (
    <>
      <button
        type="button"
        className="button"
        data-testid="toggle-button"
        aria-pressed={pressed ? 'true' : 'false'}
        mix={on('click', () => {
          pressed = !pressed
          handle.update()
        })}
      >
        Notifications
      </button>
      <output className="value" data-testid="toggle-status">
        {toggleStatusText(pressed)}
      </output>
    </>
  )
})
