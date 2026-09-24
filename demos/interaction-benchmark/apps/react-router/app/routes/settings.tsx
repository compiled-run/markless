import { useRef, useState, type FormEvent } from "react";
import { useFetcher } from "react-router";
import type { Route } from "./+types/settings";
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
} from "../shared/data";

export function meta() {
  return [{ title: documentTitle(ROUTES[2]!) }];
}

export async function clientAction({ request }: Route.ClientActionArgs): Promise<SettingsResponseBody> {
  try {
    const response = await fetch(SETTINGS_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: await request.text(),
    });
    return (await response.json()) as SettingsResponseBody;
  } catch {
    return { ok: false, error: SETTINGS_NETWORK_ERROR_MESSAGE };
  }
}

const FIELDS: readonly {
  key: SettingsField;
  testid: string;
  label: string;
  type: "text" | "email";
  inputMode?: "numeric" | "decimal";
}[] = [
  { key: "name", testid: "settings-name", label: "Display name", type: "text" },
  { key: "email", testid: "settings-email", label: "Email", type: "email" },
  { key: "quantity", testid: "settings-quantity", label: "Quantity", type: "text", inputMode: "numeric" },
  { key: "unitPrice", testid: "settings-unit-price", label: "Unit price", type: "text", inputMode: "decimal" },
];

export default function Settings() {
  const fetcher = useFetcher<typeof clientAction>();
  const [values, setValues] = useState<SettingsValues>(SETTINGS_INITIAL);
  const [attempted, setAttempted] = useState(false);
  const inputs = useRef<Partial<Record<SettingsField, HTMLInputElement | null>>>({});

  const errors = attempted ? validateSettings(values) : {};
  const pending = fetcher.state !== "idle";
  const result = pending ? undefined : fetcher.data;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    const found = validateSettings(values);
    if (hasErrors(found)) {
      const first = FIELDS.find((f) => found[f.key]);
      if (first) inputs.current[first.key]?.focus();
      return;
    }
    fetcher.submit({ ...values }, { method: "post", encType: "application/json", flushSync: true });
  }

  return (
    <>
      <h1 className="page-title" data-testid="page-title">
        Settings
      </h1>
      <form className="form" data-testid="settings-form" noValidate onSubmit={submit}>
        {FIELDS.map((field) => {
          const error = errors[field.key];
          const errorId = `${field.testid}-error`;
          return (
            <div className="field" key={field.key}>
              <label className="field-label" htmlFor={field.testid}>
                {field.label}
              </label>
              <input
                ref={(el) => {
                  inputs.current[field.key] = el;
                }}
                className="input"
                id={field.testid}
                name={field.key}
                type={field.type}
                inputMode={field.inputMode}
                data-testid={field.testid}
                value={values[field.key]}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setValues((prev) => ({ ...prev, [field.key]: value }));
                }}
              />
              {error && (
                <p className="field-error" id={errorId} data-testid={errorId}>
                  {error}
                </p>
              )}
            </div>
          );
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
            {pending ? SETTINGS_PENDING_TEXT : result?.ok ? result.message : ""}
          </p>
        </div>
        {result && !result.ok && (
          <p className="alert" data-testid="settings-error" role="alert">
            {result.error}
          </p>
        )}
      </form>
    </>
  );
}
