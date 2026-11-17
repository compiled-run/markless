package dev.markless.mobile.view

import android.app.Activity
import android.os.Bundle
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject

// The Android host's entry point with a hand-made screen behind it, so the harness is proven without the real host; its payload only names the button label per platform.
abstract class MarklessActivity : Activity() {
	abstract fun payloadBytes(): ByteArray

	open fun styleExportBytes(): ByteArray? = null

	override fun onCreate(savedInstanceState: Bundle?) {
		super.onCreate(savedInstanceState)
		val label = JSONObject(String(payloadBytes())).optJSONObject("label")?.optString("android", "Tap") ?: "Tap"
		var taps = 0
		setContentView(LinearLayout(this).apply {
			orientation = LinearLayout.VERTICAL
			setPadding(48, 160, 48, 0)
			addView(TextView(context).apply { text = "Harness" })
			addView(Button(context).apply {
				isAllCaps = false
				text = "$label 0"
				setOnClickListener { taps += 1; text = "$label $taps" }
			})
		})
	}
}
