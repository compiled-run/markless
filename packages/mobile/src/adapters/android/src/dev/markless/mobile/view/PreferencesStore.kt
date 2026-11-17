package dev.markless.mobile.view

import android.content.Context
import dev.markless.mobile.core.Json
import dev.markless.mobile.core.JsValue
import dev.markless.mobile.core.Store
import dev.markless.mobile.core.jsonValue

/** Storage cells in `SharedPreferences`, each value kept as its JSON text (`JSON.stringify`, so NaN reads back as null). */
class PreferencesStore(context: Context, name: String = "markless") : Store {
	private val prefs = context.getSharedPreferences(name, Context.MODE_PRIVATE)

	override fun get(key: String): JsValue? = prefs.getString(key, null)?.let { JsValue.fromJson(Json.parse(it)) }

	override fun set(key: String, value: JsValue) {
		prefs.edit().putString(key, jsonValue(value)).commit()
	}
}
