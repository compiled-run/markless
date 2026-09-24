import { track } from 'ripple';
import { AppShell } from '../components/AppShell.tsrx';
import {
	SETTINGS_ENDPOINT,
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
} from '../shared/data.ts';

interface FieldSpec {
	field: SettingsField;
	testId: string;
	label: string;
	type: 'text' | 'email';
	inputMode?: 'numeric' | 'decimal';
}

const FIELDS: readonly FieldSpec[] = [
	{ field: 'name', testId: 'settings-name', label: 'Display name', type: 'text' },
	{ field: 'email', testId: 'settings-email', label: 'Email', type: 'email' },
	{ field: 'quantity', testId: 'settings-quantity', label: 'Quantity', type: 'text', inputMode: 'numeric' },
	{ field: 'unitPrice', testId: 'settings-unit-price', label: 'Unit price', type: 'text', inputMode: 'decimal' },
];

export function Settings() @{
	const values = track<SettingsValues>({ ...SETTINGS_INITIAL });
	const attempted = track(false);
	const pending = track(false);
	const status = track('');
	const serverError = track('');
	const errors = track<SettingsErrors>(() => (attempted.value ? validateSettings(values.value) : {}));
	const inputs: Partial<Record<SettingsField, HTMLInputElement>> = {};

	function update(field: SettingsField, value: string) {
		values.value = { ...values.value, [field]: value };
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (pending.value) return;
		attempted.value = true;
		const snapshot = values.value;
		const found = validateSettings(snapshot);
		if (hasErrors(found)) {
			const first = FIELDS.find((spec) => found[spec.field] !== undefined)!;
			inputs[first.field]?.focus();
			return;
		}
		pending.value = true;
		status.value = SETTINGS_PENDING_TEXT;
		serverError.value = '';
		let body: SettingsResponseBody | null = null;
		let ok = false;
		try {
			const response = await fetch(SETTINGS_ENDPOINT, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(snapshot),
			});
			ok = response.status === 200;
			body = (await response.json()) as SettingsResponseBody;
		} catch {
			body = null;
		}
		pending.value = false;
		if (ok && body?.ok) {
			status.value = body.message;
		} else {
			status.value = '';
			serverError.value = body && !body.ok ? body.error : SETTINGS_NETWORK_ERROR_MESSAGE;
		}
	}

	<AppShell route="settings">
		<form class="form" data-testid="settings-form" novalidate onSubmit={submit}>
			@for (const spec of FIELDS; key spec.field) {
				<div class="field">
					<label class="field-label" for={spec.testId}>{spec.label}</label>
					<input
						class="input"
						type={spec.type}
						id={spec.testId}
						name={spec.field}
						data-testid={spec.testId}
						inputmode={spec.inputMode}
						value={values.value[spec.field]}
						ref={(node: HTMLInputElement) => {
							inputs[spec.field] = node;
						}}
						aria-invalid={errors.value[spec.field] ? 'true' : undefined}
						aria-describedby={errors.value[spec.field] ? `${spec.testId}-error` : undefined}
						onInput={(event: Event) => update(spec.field, (event.target as HTMLInputElement).value)}
					/>
					@if (errors.value[spec.field]) {
						<p class="field-error" id={`${spec.testId}-error`} data-testid={`${spec.testId}-error`}>
							{errors.value[spec.field]}
						</p>
					}
				</div>
			}
			<p class="derived" data-testid="settings-total">{settingsTotalText(values.value)}</p>
			<div class="form-actions">
				<button type="submit" class="button button-primary" data-testid="settings-submit" disabled={pending.value}>
					{pending.value ? SETTINGS_PENDING_TEXT : SETTINGS_SUBMIT_TEXT}
				</button>
				<p class="status" data-testid="settings-status" role="status">{status.value}</p>
			</div>
			@if (serverError.value) {
				<p class="alert" data-testid="settings-error" role="alert">{serverError.value}</p>
			}
		</form>
	</AppShell>
}
