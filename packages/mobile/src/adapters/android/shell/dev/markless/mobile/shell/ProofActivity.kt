package dev.markless.mobile.shell

import dev.markless.mobile.view.MarklessActivity
import java.io.FileNotFoundException

class ProofActivity : MarklessActivity() {
	override fun payloadBytes(): ByteArray = assets.open("markless/payload.json").use { it.readBytes() }

	override fun styleExportBytes(): ByteArray? = try {
		assets.open("markless/style.json").use { it.readBytes() }
	} catch (_: FileNotFoundException) {
		null
	}
}
