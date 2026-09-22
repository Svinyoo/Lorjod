import Foundation

enum AppRole: String, CaseIterable {
    case renter, landlord, admin

    var title: String {
        switch self {
        case .renter: return "Parkly Renter"
        case .landlord: return "Parkly Landlord"
        case .admin: return "Parkly Admin"
        }
    }

    var subtitle: String {
        switch self {
        case .renter: return "ผู้เช่าที่จอดรถ"
        case .landlord: return "ผู้ให้เช่าลานจอด"
        case .admin: return "ผู้ดูแลระบบ"
        }
    }

    var homePath: String { self == .renter ? "/" : "/\(rawValue)/" }

    func permitsPage(_ url: URL) -> Bool {
        let path = url.path
        let prefix = self == .renter ? "" : "/\(rawValue)"
        var pages = [prefix, prefix + "/", prefix + "/index.html", prefix + "/login.html"]
        if self != .admin { pages.append(prefix + "/register.html") }
        return pages.contains(path)
    }
}

enum ServerPolicy {
    enum InvalidServer: LocalizedError {
        case invalidOrigin, insecure
        var errorDescription: String? {
            switch self {
            case .invalidOrigin:
                return "ใส่ URL ของเซิร์ฟเวอร์เท่านั้น เช่น https://parkly.example.com โดยไม่ใส่ path, บัญชี, query หรือ #"
            case .insecure:
                return "ต้องใช้ HTTPS; รุ่น Debug อนุญาต HTTP เฉพาะ localhost, ชื่อ .local และ IP เครือข่ายส่วนตัว"
            }
        }
    }

    static func origin(_ text: String, allowLocalHTTP: Bool) throws -> URL {
        let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.contains(where: { $0.isWhitespace }),
              let parts = URLComponents(string: value),
              let scheme = parts.scheme?.lowercased(),
              let host = parts.host?.lowercased(), !host.isEmpty,
              parts.user == nil, parts.password == nil,
              parts.query == nil, parts.fragment == nil,
              parts.path.isEmpty || parts.path == "/",
              parts.port == nil || (1...65535).contains(parts.port!),
              let url = parts.url else { throw InvalidServer.invalidOrigin }
        guard scheme == "https" || (scheme == "http" && allowLocalHTTP && isLocal(host)) else {
            throw InvalidServer.insecure
        }
        var normalized = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        normalized.scheme = scheme
        normalized.host = host
        normalized.path = ""
        return normalized.url!
    }

    static func sameOrigin(_ first: URL, _ second: URL) -> Bool {
        func port(_ url: URL) -> Int? { url.port ?? (url.scheme?.lowercased() == "https" ? 443 : 80) }
        return first.scheme?.lowercased() == second.scheme?.lowercased()
            && first.host?.lowercased() == second.host?.lowercased()
            && port(first) == port(second)
            && first.user == nil && first.password == nil
            && second.user == nil && second.password == nil
    }

    private static func isLocal(_ host: String) -> Bool {
        if host == "localhost" || host.hasSuffix(".local") || host == "[::1]" || host == "::1" { return true }
        let pieces = host.split(separator: ".", omittingEmptySubsequences: false)
        guard pieces.count == 4, pieces.allSatisfy({ !$0.isEmpty && $0.allSatisfy(\.isNumber) }),
              let a = Int(pieces[0]), let b = Int(pieces[1]),
              pieces.allSatisfy({ (0...255).contains(Int($0) ?? -1) }) else { return false }
        return a == 10 || a == 127 || (a == 172 && (16...31).contains(b)) || (a == 192 && b == 168)
    }
}
