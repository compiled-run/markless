import { Title } from "@solidjs/meta";
import { createMemo, createSignal, createStore, For, Show } from "solid-js";
import {
  documentTitle,
  hasErrors,
  ROUTES,
  SETTINGS_ENDPOINT,
  SETTINGS_INITIAL,
  SETTINGS_INVALID_MESSAGE,
  SETTINGS_NETWORK_ERROR_MESSAGE,
  SETTINGS_PENDING_TEXT,
  SETTINGS_SUBMIT_TEXT,
  type SettingsField,
  type SettingsResponseBody,
  type SettingsValues,
  settingsTotalText,
  validateSettings,
} from "../shared/data";

const FIELDS: readonly {
  field: SettingsField;
  id: string;
  label: string;
  type: string;
  inputmode?: "numeric" | "decimal";
}[] = [
  { field: "name", id: "settings-name", label: "Display name", type: "text" },
  { field: "email", id: "settings-email", label: "Email", type: "email" },
  { field: "quantity", id: "settings-quantity", label: "Quantity", type: "text", inputmode: "numeric" },
  { field: "unitPrice", id: "settings-unit-price", label: "Unit price", type: "text", inputmode: "decimal" },
];

export default function Settings() {
  const [values, setValues] = createStore<SettingsValues>({ ...SETTINGS_INITIAL });
  const [attempted, setAttempted] = createSignal(false);
  const [pending, setPending] = createSignal(false);
  const [status, setStatus] = createSignal("");
  const [serverError, setServerError] = createSignal<string | null>(null);
  const errors = createMemo(() => (attempted() ? validateSettings(values) : {}));
  const inputs: Partial<Record<SettingsField, HTMLInputElement>> = {};

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (pending()) return;
    setAttempted(true);
    const found = validateSettings(values);
    if (hasErrors(found)) {
      const first = FIELDS.find(({ field }) => found[field] !== undefined);
      if (first) inputs[first.field]?.focus();
      return;
    }
    setPending(true);
    setStatus(SETTINGS_PENDING_TEXT);
    setServerError(null);
    const payload: SettingsValues = {
      name: values.name,
      email: values.email,
      quantity: values.quantity,
      unitPrice: values.unitPrice,
    };
    try {
      const response = await fetch(SETTINGS_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => ({ ok: false, error: SETTINGS_INVALID_MESSAGE }))) as SettingsResponseBody;
      if (response.status === 200 && body.ok) {
        setStatus(body.message);
      } else {
        setStatus("");
        setServerError(body.ok ? SETTINGS_INVALID_MESSAGE : body.error);
      }
    } catch {
      setStatus("");
      setServerError(SETTINGS_NETWORK_ERROR_MESSAGE);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Title>{documentTitle(ROUTES[2]!)}</Title>
      <h1 class="page-title" data-testid="page-title">Settings</h1>
      <form class="form" data-testid="settings-form" novalidate onSubmit={submit}>
        <For each={FIELDS}>
          {({ field, id, label, type, inputmode }) => {
            const error = () => errors()[field];
            return (
              <div class="field">
                <label class="field-label" for={id}>{label}</label>
                <input
                  ref={(el) => (inputs[field] = el)}
                  id={id}
                  class="input"
                  type={type}
                  inputmode={inputmode}
                  data-testid={id}
                  value={values[field]}
                  aria-invalid={error() ? "true" : undefined}
                  aria-describedby={error() ? `${id}-error` : undefined}
                  onInput={(event) => {
                    const value = event.currentTarget.value;
                    setValues((draft) => {
                      draft[field] = value;
                    });
                  }}
                />
                <Show when={error()}>
                  {(message) => (
                    <p class="field-error" id={`${id}-error`} data-testid={`${id}-error`}>{message()}</p>
                  )}
                </Show>
              </div>
            );
          }}
        </For>
        <p class="derived" data-testid="settings-total">{settingsTotalText(values)}</p>
        <div class="form-actions">
          <button type="submit" class="button button-primary" data-testid="settings-submit" disabled={pending()}>
            {pending() ? SETTINGS_PENDING_TEXT : SETTINGS_SUBMIT_TEXT}
          </button>
          <p class="status" data-testid="settings-status" role="status">{status()}</p>
        </div>
        <Show when={serverError()}>
          {(message) => <p class="alert" data-testid="settings-error" role="alert">{message()}</p>}
        </Show>
      </form>
    </>
  );
}
