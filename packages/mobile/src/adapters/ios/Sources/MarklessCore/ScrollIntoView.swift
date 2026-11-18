// scrollIntoView() and focus() as Chrome scrolls, the same function as packages/mobile/src/scroll.ts (vectors: conformance/scroll).

public enum ScrollAlign: String, Sendable {
	case start, center, end, nearest
	/// focus(): no scroll when fully shown, the closest edge when partly shown, centred when hidden.
	case ifNeeded = "if-needed"
}

public struct ScrollRect: Equatable, Sendable {
	public var x: Double, y: Double, width: Double, height: Double
	public init(x: Double, y: Double, width: Double, height: Double) {
		self.x = x
		self.y = y
		self.width = width
		self.height = height
	}
}

/// An offset range in CSS scroll-offset terms: 0 is the start position, and the user scrolls between min and max.
public struct ScrollOffsetRange: Equatable, Sendable {
	public var minX: Double, maxX: Double, minY: Double, maxY: Double
	public init(minX: Double, maxX: Double, minY: Double, maxY: Double) {
		self.minX = minX
		self.maxX = maxX
		self.minY = minY
		self.maxY = maxY
	}
}

/// One scrolling box: its scrollport at offset 0 in the content coordinates of the box around it, its offset and its range.
public struct ScrollBox: Equatable, Sendable {
	public var port: ScrollRect
	public var offset: (x: Double, y: Double)
	public var range: ScrollOffsetRange
	public init(port: ScrollRect, offset: (x: Double, y: Double), range: ScrollOffsetRange) {
		self.port = port
		self.offset = offset
		self.range = range
	}
	public static func == (a: ScrollBox, b: ScrollBox) -> Bool {
		a.port == b.port && a.offset == b.offset && a.range == b.range
	}
}

public let scrollIntoViewAlign = (block: ScrollAlign.start, inline: ScrollAlign.nearest)
public let focusIntoViewAlign = (block: ScrollAlign.ifNeeded, inline: ScrollAlign.ifNeeded)

private func axis(_ offset: Double, _ start: Double, _ size: Double, _ port: Double, _ align: ScrollAlign) -> Double {
	let shownStart = start - offset
	let shownEnd = shownStart + size
	let toStart = offset + shownStart
	let toEnd = offset + shownEnd - port
	let toCenter = offset + shownStart + size / 2 - port / 2
	switch align {
	case .start: return toStart
	case .end: return toEnd
	case .center: return toCenter
	case .nearest, .ifNeeded: break
	}
	let fullyShown = shownStart >= 0 && shownEnd <= port
	if align == .ifNeeded {
		if fullyShown { return offset }
		if shownEnd <= 0 || shownStart >= port { return toCenter }
	}
	if (shownStart <= 0 && shownEnd >= port) || fullyShown { return offset }
	return (shownStart < 0) == (size <= port) ? toStart : toEnd
}

/// The offsets of `chain` (innermost box first, the page last) after bringing `target`, in the innermost box's content
/// coordinates, into view; each box sees the element where the previous box's scroll left it.
public func scrollIntoView(_ chain: [ScrollBox], target: ScrollRect, block: ScrollAlign, inline: ScrollAlign) -> [(x: Double, y: Double)] {
	var rect = target
	return chain.map { box in
		let x = min(max(axis(box.offset.x, rect.x, rect.width, box.port.width, inline), box.range.minX), box.range.maxX)
		let y = min(max(axis(box.offset.y, rect.y, rect.height, box.port.height, block), box.range.minY), box.range.maxY)
		rect = ScrollRect(x: box.port.x + rect.x - x, y: box.port.y + rect.y - y, width: rect.width, height: rect.height)
		return (x, y)
	}
}
