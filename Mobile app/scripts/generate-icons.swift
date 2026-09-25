// Geometric Parkly development icons; no external images or packages.
import AppKit
import Foundation

let output = URL(fileURLWithPath: CommandLine.arguments[1])
for (role, letter, color) in [
    ("Renter", "R", NSColor(red: 0.07, green: 0.43, blue: 0.31, alpha: 1)),
    ("Landlord", "L", NSColor(red: 0.09, green: 0.25, blue: 0.21, alpha: 1)),
    ("Admin", "A", NSColor(red: 0.13, green: 0.22, blue: 0.34, alpha: 1))
] {
    let context = CGContext(data: nil, width: 1024, height: 1024, bitsPerComponent: 8,
                            bytesPerRow: 4096, space: CGColorSpaceCreateDeviceRGB(),
                            bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: false)
    color.setFill()
    NSBezierPath(rect: NSRect(x: 0, y: 0, width: 1024, height: 1024)).fill()
    let attributes: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 650, weight: .bold), .foregroundColor: NSColor.white]
    let p = "P" as NSString
    let size = p.size(withAttributes: attributes)
    p.draw(at: NSPoint(x: (1024 - size.width) / 2, y: 250), withAttributes: attributes)
    let badge = NSRect(x: 362, y: 94, width: 300, height: 150)
    NSColor(red: 0.93, green: 0.84, blue: 0.55, alpha: 1).setFill()
    NSBezierPath(roundedRect: badge, xRadius: 52, yRadius: 52).fill()
    let labelAttributes: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 108, weight: .bold), .foregroundColor: color]
    let label = letter as NSString
    let labelSize = label.size(withAttributes: labelAttributes)
    label.draw(at: NSPoint(x: (1024 - labelSize.width) / 2, y: 100), withAttributes: labelAttributes)
    NSGraphicsContext.restoreGraphicsState()
    let bitmap = NSBitmapImageRep(cgImage: context.makeImage()!)
    try bitmap.representation(using: .png, properties: [:])!.write(to: output.appendingPathComponent("AppIcon\(role).appiconset/AppIcon.png"))
}
print("Generated three 1024px app icons.")
