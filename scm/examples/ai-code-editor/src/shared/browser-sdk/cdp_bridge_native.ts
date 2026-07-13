// CDP Bridge (native) — sends arbitrary CDP commands to Chrome via WebSocket.
//
// Equivalent to cdp_bridge.mjs but uses jsc native runtime APIs instead of
// Node.js built-ins. Designed to run via `jsc run`, not `node`.
//
// Usage: jsc run cdp_bridge_native.ts <ws_debugger_url> <json_command>
//   json_command: {"method":"Page.navigate","params":{"url":"..."}}
//   or for Runtime.evaluate shorthand: just pass a JS expression string
//
// Output: JSON-encoded result on stdout, errors on stderr.

// ---------------------------------------------------------------------------
// jsc native API declarations (provided by the justscript runtime)
// ---------------------------------------------------------------------------

declare function tcp_connect(host: string, port: number): number;
declare function tcp_write(handle: number, data: string): number;
declare function tcp_read(handle: number): string;
declare function tcp_close(handle: number): void;
declare function sha1(input: string): string;
declare function base64_encode(input: string): string;
declare function process_exit(code: number): void;
declare function process_env(key: string): string;

// argv is typically available as a global in jsc
declare let argv: string[];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WS_MAGIC_GUID: string = "258EAFA5-E914-47DA-95CA-5AB5AA286923";
const TIMEOUT_MS: number = 15000;

// ---------------------------------------------------------------------------
// URL parser (minimal — handles ws://host:port/path)
// ---------------------------------------------------------------------------

function parseWsUrl(wsUrl: string): { host: string; port: number; path: string } {
  // Strip protocol
  let stripped: string = wsUrl;
  if (stripped.indexOf("ws://") === 0) {
    stripped = stripped.substring(5);
  } else if (stripped.indexOf("wss://") === 0) {
    stripped = stripped.substring(6);
  }

  // Split host:port from path
  let slashIdx: number = stripped.indexOf("/");
  let hostPort: string;
  let path: string;
  if (slashIdx >= 0) {
    hostPort = stripped.substring(0, slashIdx);
    path = stripped.substring(slashIdx);
  } else {
    hostPort = stripped;
    path = "/";
  }

  // Split host from port
  let colonIdx: number = hostPort.indexOf(":");
  let host: string;
  let port: number;
  if (colonIdx >= 0) {
    host = hostPort.substring(0, colonIdx);
    port = parseInt(hostPort.substring(colonIdx + 1));
  } else {
    host = hostPort;
    port = 80;
  }

  return { host: host, port: port, path: path };
}

// ---------------------------------------------------------------------------
// Pseudo-random bytes (deterministic seed from process PID + timestamp)
// ---------------------------------------------------------------------------

let _rngState: number = 0;

function initRng(): void {
  // Use a combination of factors for a non-repeating seed.
  // In jsc, Date.now() should be available as a global.
  _rngState = Date.now() ^ 0xDEADBEEF;
}

function nextRngByte(): number {
  // xorshift32-style PRNG — sufficient for WebSocket mask keys
  _rngState = _rngState ^ (_rngState << 13);
  _rngState = _rngState ^ (_rngState >>> 17);
  _rngState = _rngState ^ (_rngState << 5);
  return (_rngState >>> 0) & 0xFF;
}

function randomBytesAsString(count: number): string {
  let result: string = "";
  let i: number = 0;
  while (i < count) {
    result = result + String.fromCharCode(nextRngByte());
    i = i + 1;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Hex-to-bytes conversion (for SHA-1 digest → binary for base64)
// ---------------------------------------------------------------------------

function hexToBytes(hex: string): string {
  let result: string = "";
  let i: number = 0;
  while (i < hex.length) {
    let byte: number = parseInt(hex.substring(i, i + 2), 16);
    result = result + String.fromCharCode(byte);
    i = i + 2;
  }
  return result;
}

// ---------------------------------------------------------------------------
// WebSocket handshake
// ---------------------------------------------------------------------------

function performHandshake(
  handle: number,
  host: string,
  port: number,
  path: string
): string {
  // 1. Generate 16 random bytes, base64 encode as Sec-WebSocket-Key
  let rawKey: string = randomBytesAsString(16);
  let wsKey: string = base64_encode(rawKey);

  // 2. Send HTTP upgrade request
  let request: string =
    "GET " + path + " HTTP/1.1\r\n" +
    "Host: " + host + ":" + String(port) + "\r\n" +
    "Upgrade: websocket\r\n" +
    "Connection: Upgrade\r\n" +
    "Sec-WebSocket-Key: " + wsKey + "\r\n" +
    "Sec-WebSocket-Version: 13\r\n" +
    "\r\n";

  let written: number = tcp_write(handle, request);
  if (written < 0) {
    return "ERROR: failed to send WebSocket upgrade request";
  }

  // 3. Read HTTP response
  let response: string = tcp_read(handle);
  if (response.length === 0) {
    return "ERROR: empty response to WebSocket upgrade";
  }

  // Check for 101 Switching Protocols
  if (response.indexOf("101") < 0) {
    let firstLine: string = response.substring(0, response.indexOf("\r\n"));
    return "ERROR: WebSocket upgrade failed: " + firstLine;
  }

  // 4. Verify Sec-WebSocket-Accept
  let expectedRaw: string = wsKey + WS_MAGIC_GUID;
  let shaHex: string = sha1(expectedRaw);
  let shaBytes: string = hexToBytes(shaHex);
  let expectedAccept: string = base64_encode(shaBytes);

  // Extract server's accept header
  let acceptHeader: string = "Sec-WebSocket-Accept: ";
  let acceptIdx: number = response.indexOf(acceptHeader);
  if (acceptIdx < 0) {
    // Accept header is case-insensitive, try lowercase
    acceptHeader = "sec-websocket-accept: ";
    acceptIdx = response.indexOf(acceptHeader);
  }

  if (acceptIdx >= 0) {
    let acceptStart: number = acceptIdx + acceptHeader.length;
    let acceptEnd: number = response.indexOf("\r\n", acceptStart);
    let serverAccept: string = response.substring(acceptStart, acceptEnd);
    if (serverAccept !== expectedAccept) {
      return "ERROR: WebSocket accept mismatch: expected " + expectedAccept + ", got " + serverAccept;
    }
  }

  return "OK";
}

// ---------------------------------------------------------------------------
// WebSocket frame encoding (client → server: masked)
// ---------------------------------------------------------------------------

function sendWsFrame(handle: number, payload: string): number {
  let payloadLen: number = payload.length;

  // Generate 4-byte mask key
  let mask0: number = nextRngByte();
  let mask1: number = nextRngByte();
  let mask2: number = nextRngByte();
  let mask3: number = nextRngByte();

  // Build frame header
  let frame: string = "";

  // First byte: FIN + opcode 0x1 (text)
  frame = frame + String.fromCharCode(0x81);

  // Second byte: MASK bit set + payload length
  if (payloadLen < 126) {
    frame = frame + String.fromCharCode(0x80 | payloadLen);
  } else if (payloadLen < 65536) {
    frame = frame + String.fromCharCode(0x80 | 126);
    frame = frame + String.fromCharCode((payloadLen >>> 8) & 0xFF);
    frame = frame + String.fromCharCode(payloadLen & 0xFF);
  } else {
    frame = frame + String.fromCharCode(0x80 | 127);
    // 8-byte extended length (big-endian) — high 4 bytes are zero for realistic payloads
    frame = frame + String.fromCharCode(0);
    frame = frame + String.fromCharCode(0);
    frame = frame + String.fromCharCode(0);
    frame = frame + String.fromCharCode(0);
    frame = frame + String.fromCharCode((payloadLen >>> 24) & 0xFF);
    frame = frame + String.fromCharCode((payloadLen >>> 16) & 0xFF);
    frame = frame + String.fromCharCode((payloadLen >>> 8) & 0xFF);
    frame = frame + String.fromCharCode(payloadLen & 0xFF);
  }

  // Mask key
  frame = frame + String.fromCharCode(mask0);
  frame = frame + String.fromCharCode(mask1);
  frame = frame + String.fromCharCode(mask2);
  frame = frame + String.fromCharCode(mask3);

  // Masked payload
  let maskBytes: number[] = [mask0, mask1, mask2, mask3];
  let i: number = 0;
  while (i < payloadLen) {
    let masked: number = payload.charCodeAt(i) ^ maskBytes[i % 4];
    frame = frame + String.fromCharCode(masked);
    i = i + 1;
  }

  return tcp_write(handle, frame);
}

// ---------------------------------------------------------------------------
// WebSocket frame decoding (server → client: unmasked)
// ---------------------------------------------------------------------------

function readWsFrame(handle: number): string {
  let raw: string = tcp_read(handle);
  if (raw.length < 2) {
    return "";
  }

  // Accumulate data — server may send in multiple TCP segments
  let buffer: string = raw;
  let attempts: number = 0;

  while (attempts < 10) {
    // Try to parse what we have
    let result: string = tryParseFrame(buffer);
    if (result !== "__NEED_MORE__") {
      return result;
    }
    // Need more data
    let more: string = tcp_read(handle);
    if (more.length === 0) {
      break;
    }
    buffer = buffer + more;
    attempts = attempts + 1;
  }

  return "";
}

function tryParseFrame(buffer: string): string {
  if (buffer.length < 2) {
    return "__NEED_MORE__";
  }

  let byte1: number = buffer.charCodeAt(1);
  let masked: boolean = (byte1 & 0x80) !== 0;
  let payloadLen: number = byte1 & 0x7F;
  let offset: number = 2;

  if (payloadLen === 126) {
    if (buffer.length < 4) return "__NEED_MORE__";
    payloadLen = (buffer.charCodeAt(2) << 8) | buffer.charCodeAt(3);
    offset = 4;
  } else if (payloadLen === 127) {
    if (buffer.length < 10) return "__NEED_MORE__";
    // Read 8-byte big-endian length (only lower 4 bytes matter for realistic sizes)
    payloadLen =
      (buffer.charCodeAt(6) << 24) |
      (buffer.charCodeAt(7) << 16) |
      (buffer.charCodeAt(8) << 8) |
      buffer.charCodeAt(9);
    offset = 10;
  }

  // Handle mask key if server sends masked frames (unusual but valid)
  let maskKey: number[] = [];
  if (masked) {
    if (buffer.length < offset + 4) return "__NEED_MORE__";
    maskKey = [
      buffer.charCodeAt(offset),
      buffer.charCodeAt(offset + 1),
      buffer.charCodeAt(offset + 2),
      buffer.charCodeAt(offset + 3),
    ];
    offset = offset + 4;
  }

  if (buffer.length < offset + payloadLen) {
    return "__NEED_MORE__";
  }

  let payload: string = "";
  let i: number = 0;
  while (i < payloadLen) {
    let ch: number = buffer.charCodeAt(offset + i);
    if (masked) {
      ch = ch ^ maskKey[i % 4];
    }
    payload = payload + String.fromCharCode(ch);
    i = i + 1;
  }

  return payload;
}

// ---------------------------------------------------------------------------
// CDP command builder
// ---------------------------------------------------------------------------

function buildCdpCommand(
  commandArg: string,
  sessionId: string
): { method: string; params: any; sessionId: string } {
  let cdpMethod: string = "Runtime.evaluate";
  let cdpParams: any = {};

  try {
    let parsed: any = JSON.parse(commandArg);
    cdpMethod = parsed.method || "Runtime.evaluate";
    cdpParams = parsed.params || {};
    sessionId = parsed.sessionId || sessionId;

    // If method is Runtime.evaluate and no expression param, treat as error
    if (cdpMethod === "Runtime.evaluate" && !cdpParams.expression) {
      throw new Error("no expression");
    }
  } catch (_e) {
    // Treat as a JS expression for Runtime.evaluate
    cdpMethod = "Runtime.evaluate";
    cdpParams = { expression: commandArg, returnByValue: true, awaitPromise: false };
  }

  return { method: cdpMethod, params: cdpParams, sessionId: sessionId };
}

// ---------------------------------------------------------------------------
// Result unwrapper (matches cdp_bridge.mjs behavior)
// ---------------------------------------------------------------------------

function unwrapResult(parsed: any, method: string): any {
  if (parsed.error) {
    return { __error: "CDP error: " + (parsed.error.message || JSON.stringify(parsed.error)) };
  }

  if (method === "Runtime.evaluate") {
    let evalResult: any = parsed.result && parsed.result.result;
    if (!evalResult) return null;

    if (evalResult.type === "undefined") return null;
    if (evalResult.type === "string") return evalResult.value;
    if (evalResult.type === "number" || evalResult.type === "boolean") return evalResult.value;
    if (evalResult.type === "object" && evalResult.value !== undefined) return evalResult.value;
    if (evalResult.subtype === "null") return null;
    return evalResult.description || evalResult.value || null;
  }

  // For other CDP methods, return the raw result
  return parsed.result || null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  initRng();

  let wsUrl: string = argv[2];
  let commandArg: string = argv[3];

  if (!wsUrl || !commandArg) {
    console.error("Usage: jsc run cdp_bridge_native.ts <ws_url> <json_command_or_js>");
    process_exit(1);
    return;
  }

  // Parse the CDP command
  let cmd = buildCdpCommand(commandArg, "");

  // Parse WebSocket URL
  let url = parseWsUrl(wsUrl);

  // Connect via TCP
  let handle: number = tcp_connect(url.host, url.port);
  if (handle < 0) {
    console.error("Failed to connect to " + url.host + ":" + String(url.port));
    process_exit(1);
    return;
  }

  // Perform WebSocket upgrade handshake
  let handshakeResult: string = performHandshake(handle, url.host, url.port, url.path);
  if (handshakeResult !== "OK") {
    console.error(handshakeResult);
    tcp_close(handle);
    process_exit(1);
    return;
  }

  // Build and send the CDP command as a WebSocket frame
  let msg: any = { id: 1, method: cmd.method, params: cmd.params };
  if (cmd.sessionId !== "") {
    msg.sessionId = cmd.sessionId;
  }
  let framePayload: string = JSON.stringify(msg);
  let writeResult: number = sendWsFrame(handle, framePayload);
  if (writeResult < 0) {
    console.error("Failed to send WebSocket frame");
    tcp_close(handle);
    process_exit(1);
    return;
  }

  // Read response frames until we get our response (id === 1)
  let maxAttempts: number = 50;
  let attempt: number = 0;
  while (attempt < maxAttempts) {
    let payload: string = readWsFrame(handle);
    if (payload.length === 0) {
      attempt = attempt + 1;
      continue;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(payload);
    } catch (_e) {
      attempt = attempt + 1;
      continue;
    }

    // Skip event messages and responses with wrong id
    if (parsed.id !== 1) {
      attempt = attempt + 1;
      continue;
    }

    // Found our response
    let result: any = unwrapResult(parsed, cmd.method);
    if (result && result.__error) {
      console.error(result.__error);
      tcp_close(handle);
      process_exit(1);
      return;
    }

    console.log(JSON.stringify(result));
    tcp_close(handle);
    process_exit(0);
    return;
  }

  // Timeout — no matching response received
  console.error("CDP bridge timeout: no response with id=1 after " + String(maxAttempts) + " frames");
  tcp_close(handle);
  process_exit(1);
}

main();
