// Server utilities — ported from Rust server.rs.
// Node-only (uses node:net).

import { createConnection } from "net";
import { spawnSync } from "child_process";

// ---------------------------------------------------------------------------
// Port checking
// ---------------------------------------------------------------------------

export function isPortAvailable(port: number): boolean {
  return !isServerRunning(port);
}

export function isServerRunning(port: number): boolean {
  let hosts: string[] = ["127.0.0.1", "localhost"];
  let i: number = 0;
  while (i < hosts.length) {
    try {
      let result = spawnSync(
        process.platform === "win32" ? "powershell" : "bash",
        process.platform === "win32"
          ? ["-Command", "(New-Object Net.Sockets.TcpClient).Connect('" + hosts[i] + "'," + port + ")"]
          : ["-c", "echo > /dev/tcp/" + hosts[i] + "/" + port],
        { timeout: 500, stdio: "pipe" }
      );
      if (result.status === 0) return true;
    } catch (_e) {
      // ignore
    }
    i = i + 1;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Port finding
// ---------------------------------------------------------------------------

export function findAvailablePort(startPort: number, maxAttempts: number): number {
  let offset: number = 0;
  while (offset < maxAttempts) {
    let port: number = startPort + offset;
    if (isPortAvailable(port)) return port;
    offset = offset + 1;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// URL port extraction
// ---------------------------------------------------------------------------

export function extractPortFromUrl(url: string): number {
  let isHttps: boolean = url.indexOf("https://") === 0;
  let stripped: string = url;
  if (stripped.indexOf("http://") === 0) stripped = stripped.substring(7);
  else if (stripped.indexOf("https://") === 0) stripped = stripped.substring(8);

  let slashIdx: number = stripped.indexOf("/");
  let hostPort: string = slashIdx >= 0 ? stripped.substring(0, slashIdx) : stripped;

  let colonIdx: number = hostPort.indexOf(":");
  if (colonIdx >= 0) {
    let portStr: string = hostPort.substring(colonIdx + 1);
    let port: number = parseInt(portStr, 10);
    if (!isNaN(port)) return port;
  }

  return isHttps ? 443 : 80;
}
