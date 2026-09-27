// Platform detection — ported from Rust platform.rs.
// WASM-safe TS: no enums, no optional chaining.

// ---------------------------------------------------------------------------
// OS and Arch constants
// ---------------------------------------------------------------------------

export let OS_WINDOWS: string = "windows";
export let OS_MACOS: string = "macos";
export let OS_LINUX: string = "linux";

export let ARCH_X64: string = "x64";
export let ARCH_ARM64: string = "arm64";

// ---------------------------------------------------------------------------
// Platform class
// ---------------------------------------------------------------------------

export class Platform {
  os: string;
  arch: string;

  constructor(os: string, arch: string) {
    this.os = os;
    this.arch = arch;
  }

  chromeExecutable(): string {
    if (this.os === OS_WINDOWS) return "chrome.exe";
    if (this.os === OS_MACOS) return "Google Chrome";
    return "chrome";
  }

  chromeHeadlessShellExecutable(): string {
    if (this.os === OS_WINDOWS) return "chrome-headless-shell.exe";
    return "chrome-headless-shell";
  }
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

export function currentPlatform(): Platform {
  let os: string = OS_LINUX;
  let arch: string = ARCH_X64;

  if (typeof process !== "undefined") {
    if (process.platform === "win32") os = OS_WINDOWS;
    else if (process.platform === "darwin") os = OS_MACOS;
    else os = OS_LINUX;

    if (process.arch === "arm64") arch = ARCH_ARM64;
    else arch = ARCH_X64;
  }

  return new Platform(os, arch);
}
