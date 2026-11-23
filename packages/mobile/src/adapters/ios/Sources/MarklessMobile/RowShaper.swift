#if canImport(UIKit)
import CoreText
import Foundation
import MarklessCore
import UIKit

/// Dragon's feature records: tag, value, start, end per feature (layout/src/shaping.ts FEATURE_STRIDE).
private let featureStride = 4
/// Dragon's glyph records: glyph, cluster, x advance, y advance, x offset, y offset, flags (GLYPH_STRIDE).
private let glyphStride = 7

/// Shapes a row's text as Dragon's build shapes an iOS face (parity/src/system-fonts/coretext-helper.swift and provider.ts):
/// Core Text at the CSS size, every advance and offset in 16.16 and scaled to device px. A system face, and an author face from
/// its file's bytes (`authored`, by id), which Safari draws with Core Text too. Any other face, font fallback and right-to-left
/// runs are refused by name.
func coreTextRowShaper(faces: [String: SystemFace], authored: [String: Data] = [:], dpr: Double) -> (String, Double, String, Int, Int, String, [Double]) throws -> [Double] {
	var descriptors: [String: CTFontDescriptor] = [:]
	return { faceId, size, text, start, end, language, features in
		let base: CTFont
		if let face = faces[faceId] {
			base = systemFont(face, size: size / dpr)
		} else if let bytes = authored[faceId] {
			guard let descriptor = descriptors[faceId] ?? CTFontManagerCreateFontDescriptorFromData(bytes as CFData) else {
				throw RowShapingRefusal(description: "the author face \(faceId) is not a font file Core Text reads")
			}
			descriptors[faceId] = descriptor
			base = CTFontCreateWithFontDescriptor(descriptor, size / dpr, nil)
		} else {
			throw RowShapingRefusal(description: "a row's text in \(faceId), which this host does not shape on the phone yet")
		}
		var settings: [[String: Any]] = []
		var at = 0
		while at + featureStride <= features.count {
			let raw = Int(features[at])
			let tag = String(bytes: [UInt8((raw >> 24) & 255), UInt8((raw >> 16) & 255), UInt8((raw >> 8) & 255), UInt8(raw & 255)], encoding: .ascii) ?? ""
			if Int(features[at + 2]) > start || Int(features[at + 3]) < end {
				throw RowShapingRefusal(description: "feature \(tag) covers part of a row's text, which this host does not apply")
			}
			settings.append([kCTFontOpenTypeFeatureTag as String: tag, kCTFontOpenTypeFeatureValue as String: Int(features[at + 1])])
			at += featureStride
		}
		let font = settings.isEmpty ? base : CTFontCreateCopyWithAttributes(base, 0, nil, CTFontDescriptorCreateWithAttributes([kCTFontFeatureSettingsAttribute: settings] as CFDictionary))
		var attributes: [NSAttributedString.Key: Any] = [.init(kCTFontAttributeName as String): font]
		if !language.isEmpty { attributes[.init(kCTLanguageAttributeName as String)] = language }
		let units = Array(text.utf16)
		guard start >= 0, end <= units.count, start <= end else { throw RowShapingRefusal(description: "a shaping range outside its text") }
		let line = CTTypesetterCreateLine(CTTypesetterCreateWithAttributedString(NSAttributedString(string: text, attributes: attributes)), CFRange(location: start, length: end - start))
		let want = CTFontCopyPostScriptName(font) as String
		var space: CGGlyph = 0
		var spaceChar: UniChar = 0x20
		let hasSpace = CTFontGetGlyphsForCharacters(font, &spaceChar, &space, 1)
		var spaceGlyph = space
		let spaceAdvance = hasSpace && space != 0 ? CTFontGetAdvancesForGlyphs(font, .horizontal, &spaceGlyph, nil, 1) : 0
		var out: [Double] = []
		var pen = 0.0
		for run in CTLineGetGlyphRuns(line) as! [CTRun] {
			let n = CTRunGetGlyphCount(run)
			let used = (CTRunGetAttributes(run) as! [String: Any])[kCTFontAttributeName as String] as! CTFont
			guard CTFontCopyPostScriptName(used) as String == want else {
				throw RowShapingRefusal(description: "Core Text draws part of a row's text in \(CTFontCopyPostScriptName(used) as String), not \(want) (font fallback)")
			}
			if CTRunGetStatus(run).contains(.rightToLeft) { throw RowShapingRefusal(description: "a right-to-left run in a row's text") }
			var glyphs = [CGGlyph](repeating: 0, count: n)
			var positions = [CGPoint](repeating: .zero, count: n)
			var advances = [CGSize](repeating: .zero, count: n)
			var indices = [CFIndex](repeating: 0, count: n)
			CTRunGetGlyphs(run, CFRange(), &glyphs)
			CTRunGetPositions(run, CFRange(), &positions)
			CTRunGetAdvances(run, CFRange(), &advances)
			CTRunGetStringIndices(run, CFRange(), &indices)
			for k in 0..<n {
				let isSpace = indices[k] < units.count && units[indices[k]] == 0x20 && glyphs[k] == space
				let width = isSpace ? spaceAdvance : Double(advances[k].width)
				let record: [Double] = [
					Double(glyphs[k]), Double(indices[k]), (width * 65536).rounded(), (Double(advances[k].height) * 65536).rounded(),
					((Double(positions[k].x) - pen) * 65536).rounded(), (Double(positions[k].y) * 65536).rounded(), 0,
				]
				// Safari shapes at the CSS size and scales the page by the device ratio: advances and offsets in device px, rounded as
				// the build's Math.round rounds.
				out += record.enumerated().map { i, v in i % glyphStride >= 2 && i % glyphStride <= 5 ? (v * dpr + 0.5).rounded(.down) : v }
				pen += Double(advances[k].width)
			}
		}
		return out
	}
}

/// Why a row's text is not shaped on the phone, named for the page's error.
struct RowShapingRefusal: Error, CustomStringConvertible {
	let description: String
}
#endif
