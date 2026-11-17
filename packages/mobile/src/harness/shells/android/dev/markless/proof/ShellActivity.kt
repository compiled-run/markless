package dev.markless.proof

import dev.markless.mobile.view.MarklessActivity
import java.io.FileNotFoundException

class ShellActivity : MarklessActivity() {
	override fun payloadBytes(): ByteArray = assets.open("markless/payload.json").use { it.readBytes() }

	override fun styleExportBytes(): ByteArray? =
		try {
			assets.open("markless/style.json").use { it.readBytes() }
		} catch (_: FileNotFoundException) {
			null
		}
}
