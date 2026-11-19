package dev.markless.mobile.core

/** The web's written value for a bound attribute (`marklessAttributeValue` in `@markless/web/dom-attribute`): null absent, "" bare. */
object AttributeValue {
	private val ENUMERATED_BOOLEAN = setOf("draggable", "contenteditable", "spellcheck")
	private val SPELLS_FALSE = ENUMERATED_BOOLEAN + listOf(
		"atomic", "busy", "checked", "current", "disabled", "expanded", "grabbed", "haspopup", "invalid", "modal",
		"multiline", "multiselectable", "pressed", "readonly", "required", "selected",
	).map { "aria-$it" }

	fun of(name: String, value: JsValue): String? {
		if (value == JsValue.Null || (value is JsValue.Bool && !value.value && name !in SPELLS_FALSE)) return null
		if (value is JsValue.Bool && value.value && name !in ENUMERATED_BOOLEAN && !name.startsWith("aria-") && !name.startsWith("data-")) return ""
		return JsString.of(value)
	}
}
