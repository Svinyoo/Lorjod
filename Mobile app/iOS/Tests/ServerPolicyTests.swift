import Foundation

@main
struct ServerPolicyTests {
    static func main() throws {
        var checks = 0
        func check(_ condition: @autoclosure () -> Bool, _ message: String) {
            precondition(condition(), message)
            checks += 1
        }
        for address in ["https://parkly.example.com", "https://parkly.example.com:8443/"] {
            let url = try ServerPolicy.origin(address, allowLocalHTTP: false)
            check(url.scheme == "https", "Release accepts HTTPS")
        }
        for host in ["localhost", "127.0.0.1", "10.0.0.2", "172.16.0.1", "172.31.255.255", "192.168.1.10", "mac.local", "[::1]"] {
            let url = try ServerPolicy.origin("http://\(host):3000", allowLocalHTTP: true)
            check(url.port == 3000, "Debug accepts local HTTP: \(host)")
            check((try? ServerPolicy.origin(url.absoluteString, allowLocalHTTP: false)) == nil, "Release rejects local HTTP")
        }
        for value in ["", "parkly.example.com", "file:///tmp/index.html", "javascript:alert(1)", "ftp://example.com", "https://user:pass@example.com", "https://example.com/landlord/", "https://example.com?next=x", "https://example.com/#admin", "https://example.com:0", "https://example.com:65536", "https://exa mple.com", "http://public.example.com", "http://192.168.1.999", "http://172.15.0.1", "http://172.32.0.1", "http://192.168.1.10.evil.com", "http://localhost.evil.com"] {
            check((try? ServerPolicy.origin(value, allowLocalHTTP: true)) == nil, "Reject unsafe/malformed URL: \(value)")
        }
        let origin = try ServerPolicy.origin("  HTTPS://PARKLY.EXAMPLE.COM/  ", allowLocalHTTP: false)
        check(origin.absoluteString == "https://parkly.example.com", "Normalize the configured origin")
        check(ServerPolicy.sameOrigin(URL(string: "https://parkly.example.com:443/login.html")!, origin), "Default ports are equivalent")
        for value in ["http://parkly.example.com", "https://parkly.example.com:8443", "https://parkly.example.com.evil.com", "https://user@parkly.example.com"] {
            check(!ServerPolicy.sameOrigin(URL(string: value)!, origin), "Reject origin change: \(value)")
        }
        for role in AppRole.allCases {
            check(role.permitsPage(URL(string: role.homePath, relativeTo: origin)!), "Home allowed for \(role)")
            let prefix = role == .renter ? "" : "/\(role.rawValue)"
            check(role.permitsPage(URL(string: prefix + "/login.html", relativeTo: origin)!), "Login allowed")
            check(role.permitsPage(URL(string: prefix + "/register.html", relativeTo: origin)!) == (role != .admin), "Admin has no registration")
            for other in AppRole.allCases where other != role {
                check(!role.permitsPage(URL(string: other.homePath, relativeTo: origin)!), "Cross-role navigation blocked")
            }
            for path in ["/api/auth/me", "/server/index.js", "/admin/../landlord/", prefix + "/unknown.html"] {
                check(!role.permitsPage(URL(string: path, relativeTo: origin)!), "Non-page navigation blocked")
            }
        }
        print("Server policy: \(checks) checks passed (shared production Swift source).")
    }
}
