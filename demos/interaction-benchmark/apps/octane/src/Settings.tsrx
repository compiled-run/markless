import { useRef, useState } from 'octane';
import {
	SETTINGS_ENDPOINT,
	SETTINGS_INITIAL,
	SETTINGS_NETWORK_ERROR_MESSAGE,
	SETTINGS_PENDING_TEXT,
	SETTINGS_SUBMIT_TEXT,
	hasErrors,
	settingsTotalText,
	validateSettings,
} from './shared/data.ts';
import type { SettingsErrors, SettingsField, SettingsResponseBody, SettingsValues } from './shared/data.ts';

interface FieldSpec {
	field: SettingsField;
	testid: string;
	label: string;
	type: 'text' | 'email';
	inputMode?: 'numeric' | 'decimal';
}

const FIELDS: readonly FieldSpec[] = [
	{ field: 'name', testid: 'settings-name', label: 'Display name', type: 'text' },
	{ field: 'email', testid: 'settings-email', label: 'Email', type: 'email' },
	{ field: 'quantity', testid: 'settings-quantity', label: 'Quantity', type: 'text', inputMode: 'numeric' },
	{ field: 'unitPrice', testid: 'settings-unit-price', label: 'Unit price', type: 'text', inputMode: 'decimal' },
];

export function Settings() @{
	const [values, setValues] = useState<SettingsValues>(() => ({ ...SETTINGS_INITIAL }));
	const [attempted, setAttempted] = useState(false);
	const [pending, setPending] = useState(false);
	const [status, setStatus] = useState('');
	const [serverError, setServerError] = useState<string | null>(null);
	const inputs = useRef(new Map<SettingsField, HTMLInputElement>());

	const errors: SettingsErrors = attempted ? validateSettings(values) : {};

	const submit = async (event: SubmitEvent) => {
		event.preventDefault();
		if (pending) return;
		setAttempted(true);
		const found = validateSettings(values);
		if (hasErrors(found)) {
			const first = FIELDS.find((spec) => found[spec.field] !== undefined);
			if (first) inputs.current.get(first.field)?.focus();
			return;
		}
		setPending(true);
		setStatus(SETTINGS_PENDING_TEXT);
		setServerError(null);
		try {
			const response = await fetch(SETTINGS_ENDPOINT, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					name: values.name,
					email: values.email,
					quantity: values.quantity,
					unitPrice: values.unitPrice,
				}),
			});
			const body = (await response.json()) as SettingsResponseBody;
			if (response.status === 200 && body.ok) {
				setStatus(body.message);
			} else {
				setStatus('');
				setServerError(body.ok ? SETTINGS_NETWORK_ERROR_MESSAGE : body.error);
			}
		} catch {
			setStatus('');
			setServerError(SETTINGS_NETWORK_ERROR_MESSAGE);
		} finally {
			setPending(false);
		}
	};

	<form class="form" data-testid="settings-form" noValidate onSubmit={submit}>
		@for (const spec of FIELDS; key spec.field) {
			<div class="field">
				<label class="field-label" for={spec.testid}>{spec.label}</label>
				<input
					class="input"
					id={spec.testid}
					type={spec.type}
					inputMode={spec.inputMode}
					data-testid={spec.testid}
					value={values[spec.field]}
					aria-invalid={errors[spec.field] !== undefined ? 'true' : undefined}
					aria-describedby={errors[spec.field] !== undefined ? spec.testid + '-error' : undefined}
					ref={(element: HTMLInputElement | null) => {
						if (element) inputs.current.set(spec.field, element);
						else inputs.current.delete(spec.field);
					}}
					onInput={(event: Event) => {
						const value = (event.currentTarget as HTMLInputElement).value;
						setValues((current) => ({ ...current, [spec.field]: value }));
					}}
				/>
				@if (errors[spec.field] !== undefined) {
					<p class="field-error" id={spec.testid + '-error'} data-testid={spec.testid + '-error'}>
						{errors[spec.field]}
					</p>
				}
			</div>
		}
		<p class="derived" data-testid="settings-total">{settingsTotalText(values)}</p>
		<div class="form-actions">
			<button class="button button-primary" type="submit" data-testid="settings-submit" disabled={pending}>
				{pending ? SETTINGS_PENDING_TEXT : SETTINGS_SUBMIT_TEXT}
			</button>
			<p class="status" data-testid="settings-status" role="status">{status}</p>
		</div>
		@if (serverError !== null) {
			<p class="alert" data-testid="settings-error" role="alert">{serverError}</p>
		}
	</form>
}
