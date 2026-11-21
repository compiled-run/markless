import Foundation
@testable import MarklessCore
import Testing

// The u17 rung's payload and Dragon's export of it (proofs/u17-borders-dashed): dashed and dotted sides carry Dragon's own
// border operations (paint-dash.ts), which Dragon compares with Chrome's pixels; the host only draws them.
private func fixture(_ name: String) throws -> Data {
	try Data(contentsOf: try #require(Bundle.module.url(forResource: "Fixtures/\(name)", withExtension: "json")))
}

private func borders(_ edit: (String) -> String = { $0 }) throws -> StyleLayout {
	let payload = try NativeViewPayload.decode(try JSONValue.parse(try fixture("u17-borders-dashed.payload")))
	let runtime = NativeRuntime(payload: payload)
	let export = Data(edit(String(decoding: try fixture("u17-borders-dashed.native-style"), as: UTF8.self)).utf8)
	return try StyleExport.decode(export).resolve(for: payload, initialTexts: try runtime.texts(), value: runtime.value(of:))
}

@Test func dashedAndDottedSidesDrawDragonsOperations() throws {
	let layout = try borders()
	let dashed = try #require(layout.styles["h2"]?.dashedBorder)
	#expect(dashed.scale == 3)
	#expect(dashed.colors.allSatisfy { $0 == RGBA(r: 34, g: 34, b: 59, alpha: 255) })
	#expect(dashed.ops.ops.filter { $0.op == "fill" }.count > 20)
	let dotted = try #require(layout.styles["h3"]?.dashedBorder)
	#expect(dotted.ops.ops.contains { $0.op == "dot" })
	// Mixed sides: a solid bottom side is drawn by the same operations, not as a uniform layer border.
	let mixed = try #require(layout.styles["h4"])
	#expect(mixed.dashedBorder != nil && mixed.borderWidth == 0 && mixed.sides == nil)
	// A solid box keeps its layer border.
	#expect(layout.styles["h5"]?.dashedBorder == nil && layout.styles["h5"]?.borderWidth != 0)
}

@Test func refusesAnOperationItDoesNotKnow() throws {
	#expect(throws: PayloadError.self) { try borders { $0.replacingOccurrences(of: "\"op\": \"dot\"", with: "\"op\": \"arc\"") } }
}
