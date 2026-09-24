import { clientEntry, on, ref, type Handle } from 'remix/ui'

import {
  SETTINGS_INITIAL,
  SETTINGS_NETWORK_ERROR_MESSAGE,
  SETTINGS_PENDING_TEXT,
  SETTINGS_SUBMIT_TEXT,
  hasErrors,
  settingsTotalText,
  validateSettings,
  type SettingsErrors,
  type SettingsField,
  type SettingsResponseBody,
  type SettingsValues,
} from '../../shared/data.ts'

const FIELDS: readonly {
  field: SettingsField
  testId: string
  label: string
  type: 'text' | 'email'
  inputMode?: string
}[] = [
  { field: 'name', testId: 'settings-name', label: 'Display name', type: 'text' },
  { field: 'email', testId: 'settings-email', label: 'Email', type: 'email' },
  { field: 'quantity', testId: 'settings-quantity', label: 'Quantity', type: 'text', inputMode: 'numeric' },
  { field: 'unitPrice', testId: 'settings-unit-price', label: 'Unit price', type: 'text', inputMode: 'decimal' },
]

export const SettingsForm = clientEntry(
  import.meta.url,
  function SettingsForm(handle: Handle<{ action: string }>) {
    let values: SettingsValues = { ...SETTINGS_INITIAL }
    let attempted = false
    let errors: SettingsErrors = {}
    let pending = false
    let status = ''
    let serverError: string | null = null
    let inputs = new Map<SettingsField, HTMLInputElement>()

    async function submit(signal: AbortSignal) {
      attempted = true
      errors = validateSettings(values)
      if (hasErrors(errors)) {
        await handle.update()
        let first = FIELDS.find(({ field }) => errors[field])
        if (first) inputs.get(first.field)?.focus()
        return
      }

      pending = true
      status = SETTINGS_PENDING_TEXT
      serverError = null
      handle.update()

      let nextStatus = ''
      let nextError: string | null = null
      try {
        let response = await fetch(handle.props.action, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(values),
          signal,
        })
        let body = (await response.json()) as SettingsResponseBody
        if (response.status === 200 && body.ok) nextStatus = body.message
        else nextError = body.ok ? SETTINGS_NETWORK_ERROR_MESSAGE : body.error
      } catch {
        if (signal.aborted) return
        nextError = SETTINGS_NETWORK_ERROR_MESSAGE
      }
      if (signal.aborted) return
      pending = false
      status = nextStatus
      serverError = nextError
      handle.update()
    }

    return () => (
      <form
        className="form"
        data-testid="settings-form"
        action={handle.props.action}
        method="post"
        noValidate
        mix={on('submit', (event, signal) => {
          event.preventDefault()
          void submit(signal)
        })}
      >
        {FIELDS.map(({ field, testId, label, type, inputMode }) => {
          let error = attempted ? errors[field] : undefined
          let errorId = `${testId}-error`
          return (
            <div key={field} className="field">
              <label className="field-label" htmlFor={testId}>
                {label}
              </label>
              <input
                className="input"
                type={type as 'text'}
                id={testId}
                name={field}
                data-testid={testId}
                inputMode={inputMode}
                value={values[field]}
                aria-invalid={error ? 'true' : undefined}
                aria-describedby={error ? errorId : undefined}
                mix={[
                  ref((node) => inputs.set(field, node)),
                  on('input', (event) => {
                    values = { ...values, [field]: event.currentTarget.value }
                    if (attempted) errors = validateSettings(values)
                    handle.update()
                  }),
                ]}
              />
              {error ? (
                <p className="field-error" id={errorId} data-testid={errorId}>
                  {error}
                </p>
              ) : null}
            </div>
          )
        })}
        <p className="derived" data-testid="settings-total">
          {settingsTotalText(values)}
        </p>
        <div className="form-actions">
          <button
            type="submit"
            className="button button-primary"
            data-testid="settings-submit"
            disabled={pending}
          >
            {pending ? SETTINGS_PENDING_TEXT : SETTINGS_SUBMIT_TEXT}
          </button>
          <p className="status" data-testid="settings-status" role="status">
            {status}
          </p>
        </div>
        {serverError !== null ? (
          <p className="alert" data-testid="settings-error" role="alert">
            {serverError}
          </p>
        ) : null}
      </form>
    )
  },
)
