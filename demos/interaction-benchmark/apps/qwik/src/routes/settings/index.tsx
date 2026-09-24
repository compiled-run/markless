import type { DocumentHead } from "@qwik.dev/router";
import { $, component$, useComputed$, useSignal } from "@qwik.dev/core";
import {
  ROUTES,
  SETTINGS_ENDPOINT,
  SETTINGS_INITIAL,
  SETTINGS_NETWORK_ERROR_MESSAGE,
  SETTINGS_PENDING_TEXT,
  SETTINGS_SUBMIT_TEXT,
  documentTitle,
  hasErrors,
  settingsTotalText,
  validateSettings,
  type SettingsField,
  type SettingsResponseBody,
  type SettingsValues,
} from "~/shared/data";

const FIELDS: readonly {
  field: SettingsField;
  testId: string;
  label: string;
  type: "text" | "email";
  inputMode?: "numeric" | "decimal";
}[] = [
  { field: "name", testId: "settings-name", label: "Display name", type: "text" },
  { field: "email", testId: "settings-email", label: "Email", type: "email" },
  {
    field: "quantity",
    testId: "settings-quantity",
    label: "Quantity",
    type: "text",
    inputMode: "numeric",
  },
  {
    field: "unitPrice",
    testId: "settings-unit-price",
    label: "Unit price",
    type: "text",
    inputMode: "decimal",
  },
];

export default component$(() => {
  const values = useSignal<SettingsValues>({ ...SETTINGS_INITIAL });
  const attempted = useSignal(false);
  const pending = useSignal(false);
  const status = useSignal("");
  const serverError = useSignal("");
  const errors = useComputed$(() =>
    attempted.value ? validateSettings(values.value) : {},
  );

  const submit = $(async (form: HTMLFormElement) => {
    const current = values.value;
    attempted.value = true;
    const found = validateSettings(current);
    if (hasErrors(found)) {
      const first = FIELDS.find(({ field }) => found[field] !== undefined);
      const input = first && form.querySelector<HTMLInputElement>(`#${first.testId}`);
      input?.focus();
      return;
    }
    pending.value = true;
    status.value = SETTINGS_PENDING_TEXT;
    serverError.value = "";
    try {
      const response = await fetch(SETTINGS_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(current),
      });
      const body = (await response
        .json()
        .catch(() => null)) as SettingsResponseBody | null;
      if (response.status === 200 && body?.ok) {
        status.value = body.message;
      } else {
        status.value = "";
        serverError.value =
          body && !body.ok ? body.error : SETTINGS_NETWORK_ERROR_MESSAGE;
      }
    } catch {
      status.value = "";
      serverError.value = SETTINGS_NETWORK_ERROR_MESSAGE;
    } finally {
      pending.value = false;
    }
  });

  return (
    <>
      <h1 class="page-title" data-testid="page-title">
        Settings
      </h1>
      <form
        class="form"
        data-testid="settings-form"
        noValidate
        preventdefault:submit
        onSubmit$={(_, form) => submit(form)}
      >
        {FIELDS.map(({ field, testId, label, type, inputMode }) => {
          const error = errors.value[field];
          const errorId = `${testId}-error`;
          return (
            <div class="field" key={field}>
              <label class="field-label" for={testId}>
                {label}
              </label>
              <input
                class="input"
                type={type}
                inputMode={inputMode}
                id={testId}
                data-testid={testId}
                value={values.value[field]}
                aria-invalid={error ? "true" : undefined}
                aria-describedby={error ? errorId : undefined}
                onInput$={(_, el) =>
                  (values.value = { ...values.value, [field]: el.value })
                }
              />
              {error && (
                <p class="field-error" id={errorId} data-testid={errorId}>
                  {error}
                </p>
              )}
            </div>
          );
        })}
        <p class="derived" data-testid="settings-total">
          {settingsTotalText(values.value)}
        </p>
        <div class="form-actions">
          <button
            type="submit"
            class="button button-primary"
            data-testid="settings-submit"
            disabled={pending.value}
          >
            {pending.value ? SETTINGS_PENDING_TEXT : SETTINGS_SUBMIT_TEXT}
          </button>
          <p class="status" data-testid="settings-status" role="status">
            {status.value}
          </p>
        </div>
        {serverError.value && (
          <p class="alert" data-testid="settings-error" role="alert">
            {serverError.value}
          </p>
        )}
      </form>
    </>
  );
});

export const head: DocumentHead = { title: documentTitle(ROUTES[2]) };
