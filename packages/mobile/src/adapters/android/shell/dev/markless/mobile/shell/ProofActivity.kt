package dev.markless.mobile.shell

import android.os.Bundle
import android.util.Log
import dev.markless.mobile.view.DeviceConformance
import dev.markless.mobile.view.MarklessActivity
import java.io.FileNotFoundException

class ProofActivity : MarklessActivity() {
	override fun onCreate(savedInstanceState: Bundle?) {
		super.onCreate(savedInstanceState)
		if (intent.getBooleanExtra("conformance", false)) {
			for (name in assets.list("markless/conformance").orEmpty().sorted()) {
				val failures = DeviceConformance.run(this, assets.open("markless/conformance/$name").use { it.readBytes() })
				Log.i("MarklessConformance", if (failures.isEmpty()) "pass $name" else "FAIL $name: ${failures.joinToString("; ")}")
			}
		}
	}

	override fun payloadBytes(): ByteArray = assets.open("markless/payload.json").use { it.readBytes() }

	override fun styleExportBytes(): ByteArray? = try {
		assets.open("markless/style.json").use { it.readBytes() }
	} catch (_: FileNotFoundException) {
		null
	}
}
