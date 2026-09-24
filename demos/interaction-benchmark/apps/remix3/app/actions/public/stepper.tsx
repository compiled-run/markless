import { clientEntry, on, type Handle } from 'remix/ui'

import { STEPPER_INITIAL, STEPPER_MAX, STEPPER_MIN, stepperDerivedText } from '../../shared/data.ts'

export const Stepper = clientEntry(import.meta.url, function Stepper(handle: Handle) {
  let value = STEPPER_INITIAL

  function step(delta: number) {
    value = Math.min(STEPPER_MAX, Math.max(STEPPER_MIN, value + delta))
    handle.update()
  }

  return () => (
    <>
      <div className="row">
        <button
          type="button"
          className="button"
          data-testid="stepper-decrement"
          aria-label="Decrease"
          disabled={value === STEPPER_MIN}
          mix={on('click', () => step(-1))}
        >
          −
        </button>
        <output className="value" data-testid="stepper-value">
          {value}
        </output>
        <button
          type="button"
          className="button"
          data-testid="stepper-increment"
          aria-label="Increase"
          disabled={value === STEPPER_MAX}
          mix={on('click', () => step(1))}
        >
          +
        </button>
      </div>
      <p className="derived" data-testid="stepper-derived">
        {stepperDerivedText(value)}
      </p>
    </>
  )
})
