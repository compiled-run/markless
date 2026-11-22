package dev.markless.mobile.shell

import android.os.Bundle
import android.util.Log
import dev.markless.mobile.core.ConformanceEngine
import dev.markless.mobile.view.DeviceConformance
import dev.markless.mobile.view.MarklessActivity
import java.io.FileNotFoundException

class ProofActivity : MarklessActivity() {
	override fun onCreate(savedInstanceState: Bundle?) {
		super.onCreate(savedInstanceState)
		if (intent.getBooleanExtra("conformance", false)) {
			for (name in assets.list("markless/conformance").orEmpty().filter { it.endsWith(".json") }.sorted()) {
				val vector = ConformanceEngine.put(assets.open("markless/conformance/$name").use { String(it.readBytes()) }) { engine ->
					assets.open("markless/conformance/engine/$engine").use { String(it.readBytes()) }
				}
				val failures = DeviceConformance.run(this, vector.toByteArray())
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
