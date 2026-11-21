import Foundation
@testable import MarklessCore
import Testing

// A Dragon export with system faces (docs/system-fonts.md in Dragon): `systemFonts` names how each target rebuilds the platform's own
// font, and a text node's `lines` carry Dragon's glyphs and positions, which the host draws in that font.
private func fixture(_ name: String) throws -> Data {
	try Data(contentsOf: try #require(Bundle.module.url(forResource: "Fixtures/\(name)", withExtension: "json")))
}

private let run = #"{ "face": "system:system-ui:700", "size": 39, "glyphs": [65, 1501], "xs": [0, 26.25] }"#
private let faces = #"[{ "id": "system:system-ui:700", "ios": { "face": { "kind": "system", "weight": 0.4, "design": "default" } }, "android": { "file": "Roboto-Regular.ttf", "index": 0, "axes": {}, "sha256": "a" } }, { "id": "system:serif:400", "ios": { "face": { "kind": "name", "postScriptName": "TimesNewRomanPSMT" } } }]"#

private func borders(faces: String? = faces, lines: String? = #"[{ "top": -0.75, "baseline": 36, "runs": [\#(run)] }]"#) throws -> StyleLayout {
	let payload = try NativeViewPayload.decode(try JSONValue.parse(try fixture("u17-borders-dashed.payload")))
	let runtime = NativeRuntime(payload: payload)
	var text = String(decoding: try fixture("u17-borders-dashed.native-style"), as: UTF8.self)
	if let faces { text = text.replacingOccurrences(of: "\n \"fonts\": [", with: "\n \"systemFonts\": \(faces),\n \"fonts\": [") }
	if let lines { text = text.replacingOccurrences(of: "\"text\": \"Borders\",", with: "\"text\": \"Borders\", \"lines\": \(lines),") }
	return try StyleExport.decode(Data(text.utf8)).resolve(for: payload, initialTexts: try runtime.texts(), value: runtime.value(of:))
}

@Test func decodesSystemFacesAndLinesInPoints() throws {
	let layout = try borders()
	#expect(layout.systemFaces == ["system:system-ui:700": .system(weight: 0.4, design: "default"), "system:serif:400": .named(postScriptName: "TimesNewRomanPSMT")])
	let style = try #require(layout.styles["h1:text0"])
	#expect(style.lines == [TextLine(top: -0.25, baseline: 12, runs: [GlyphRun(face: "system:system-ui:700", size: 13, glyphs: [65, 1501], xs: [0, 8.75])])])
	#expect(style.linesText == "Borders")
	#expect(layout.styles["h2:text0"]?.lines == nil)
}

@Test func anExportWithoutSystemFontsHasNone() throws {
	#expect(try borders(faces: nil, lines: nil).systemFaces.isEmpty)
}

@Test func refusesBadSystemFaces() throws {
	for bad in [
		#"{}"#,
		#"[{ "id": "sha256:ab", "ios": { "face": { "kind": "name", "postScriptName": "X" } } }]"#,
		#"[{ "id": "system:serif:400", "android": {} }]"#,
		#"[{ "id": "system:serif:400", "ios": { "face": { "kind": "file", "file": "x" } } }]"#,
		#"[{ "id": "system:serif:400", "ios": { "face": { "kind": "system", "weight": 2, "design": "default" } } }]"#,
		#"[{ "id": "system:serif:400", "ios": { "face": { "kind": "system", "weight": 0, "design": "rounded" } } }]"#,
		#"[{ "id": "system:serif:400", "ios": { "face": { "kind": "name", "postScriptName": "" } } }]"#,
		#"[{ "id": "system:serif:400", "ios": { "face": { "kind": "name", "postScriptName": "X", "size": 3 } } }]"#,
		#"[{ "id": "system:serif:400", "ios": { "face": { "kind": "name", "postScriptName": "X" } } }, { "id": "system:serif:400", "ios": { "face": { "kind": "name", "postScriptName": "X" } } }]"#,
	] {
		#expect(throws: PayloadError.self, "\(bad)") { try borders(faces: bad, lines: nil) }
	}
}

@Test func refusesBadLines() throws {
	for bad in [
		#"{}"#,
		#"[{ "top": 0, "baseline": 1, "runs": [], "width": 3 }]"#,
		#"[{ "top": 0, "runs": [] }]"#,
		#"[{ "top": 0, "baseline": 1, "runs": [{ "face": "a", "size": 10, "glyphs": [1, 2], "xs": [0] }] }]"#,
		#"[{ "top": 0, "baseline": 1, "runs": [{ "face": "a", "size": 10, "glyphs": [], "xs": [] }] }]"#,
		#"[{ "top": 0, "baseline": 1, "runs": [{ "face": "a", "size": 10, "glyphs": [1.5], "xs": [0] }] }]"#,
		#"[{ "top": 0, "baseline": 1, "runs": [{ "face": "a", "size": 10, "glyphs": [70000], "xs": [0] }] }]"#,
		#"[{ "top": 0, "baseline": 1, "runs": [{ "face": "a", "size": 0, "glyphs": [1], "xs": [0] }] }]"#,
		#"[{ "top": 0, "baseline": 1, "runs": [{ "size": 10, "glyphs": [1], "xs": [0] }] }]"#,
	] {
		#expect(throws: PayloadError.self, "\(bad)") { try borders(lines: bad) }
	}
}
