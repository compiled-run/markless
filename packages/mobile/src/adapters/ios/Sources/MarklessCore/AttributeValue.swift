private let enumeratedBooleans: Set<String> = ["draggable", "contenteditable", "spellcheck"]
// Mirrors SPELLS_FALSE in packages/web/src/dom-attribute.ts; the attributes vector holds both host runtimes to it.
private let spellsFalse: Set<String> = enumeratedBooleans.union([
	"aria-atomic", "aria-busy", "aria-checked", "aria-current", "aria-disabled", "aria-expanded", "aria-grabbed",
	"aria-haspopup", "aria-invalid", "aria-modal", "aria-multiline", "aria-multiselectable", "aria-pressed",
	"aria-readonly", "aria-required", "aria-selected",
])

/// The web's `marklessAttributeValue`: nil is absent, "" is a bare attribute.
public func marklessAttributeValue(_ name: String, _ value: NativeValue) -> String? {
	if case .null = value { return nil }
	if case .bool(false) = value, !spellsFalse.contains(name) { return nil }
	if case .bool(true) = value, !enumeratedBooleans.contains(name), !name.hasPrefix("aria-"), !name.hasPrefix("data-") {
		return ""
	}
	return value.text
}
