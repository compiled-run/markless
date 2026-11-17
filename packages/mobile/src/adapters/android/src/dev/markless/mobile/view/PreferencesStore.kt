package dev.markless.mobile.view

import android.content.Context
import dev.markless.mobile.core.Json
import dev.markless.mobile.core.JsString
import dev.markless.mobile.core.Scalar
import dev.markless.mobile.core.Store
import dev.markless.mobile.core.jsonString

/** Storage cells in `SharedPreferences`, each value kept as its JSON text so strings, numbers and booleans read back as written. */
class PreferencesStore(context: Context, name: String = "markless") : Store {
	private val prefs = context.getSharedPreferences(name, Context.MODE_PRIVATE)

	override fun get(key: String): Scalar? = prefs.getString(key, null)?.let { text ->
		when (val j = Json.parse(text)) {
			is Json.Str -> Scalar.Str(j.value)
			is Json.Num -> Scalar.Num(j.value)
			is Json.Bool -> Scalar.Bool(j.value)
			Json.Null -> Scalar.Null
			else -> throw MarklessHostError("stored value for \"$key\" is not a scalar")
		}
	}

	override fun set(key: String, value: Scalar) {
		val text = when (value) {
			Scalar.Null -> "null"
			is Scalar.Str -> jsonString(value.value)
			is Scalar.Bool -> value.value.toString()
			is Scalar.Num -> if (value.value.isNaN() || value.value.isInfinite()) throw MarklessHostError("cannot keep $value for \"$key\"") else JsString.number(value.value)
		}
		prefs.edit().putString(key, text).commit()
	}
}
