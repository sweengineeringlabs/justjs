// Browser types — ported from Rust cdp/types.rs + lib.rs.
// WASM-safe TS: no enums, no generics, no optional chaining.

// ---------------------------------------------------------------------------
// Viewport
// ---------------------------------------------------------------------------

export class Viewport {
  width: number;
  height: number;
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;

  constructor(width: number, height: number, deviceScaleFactor: number, isMobile: boolean, hasTouch: boolean) {
    this.width = width;
    this.height = height;
    this.deviceScaleFactor = deviceScaleFactor;
    this.isMobile = isMobile;
    this.hasTouch = hasTouch;
  }
}

export function viewportDefault(): Viewport {
  return new Viewport(1280, 720, 1.0, false, false);
}

export function viewportNew(width: number, height: number): Viewport {
  return new Viewport(width, height, 1.0, false, false);
}

export function viewportMobile(width: number, height: number): Viewport {
  return new Viewport(width, height, 2.0, true, true);
}

export function viewportIphone14Pro(): Viewport { return viewportMobile(393, 852); }
export function viewportIphoneSe(): Viewport { return viewportMobile(375, 667); }
export function viewportIpad(): Viewport { return new Viewport(768, 1024, 2.0, true, true); }
export function viewportDesktopHd(): Viewport { return viewportNew(1920, 1080); }
export function viewportDesktop(): Viewport { return viewportNew(1280, 720); }
export function viewportTablet(): Viewport { return viewportIpad(); }

// ---------------------------------------------------------------------------
// Load state constants
// ---------------------------------------------------------------------------

export let LOAD_DOM_CONTENT_LOADED: string = "DomContentLoaded";
export let LOAD_LOAD: string = "Load";
export let LOAD_NETWORK_IDLE: string = "NetworkIdle";

// ---------------------------------------------------------------------------
// Mouse button constants
// ---------------------------------------------------------------------------

export let MOUSE_LEFT: string = "left";
export let MOUSE_RIGHT: string = "right";
export let MOUSE_MIDDLE: string = "middle";

// ---------------------------------------------------------------------------
// Modifier keys
// ---------------------------------------------------------------------------

export let MOD_ALT: number = 1;
export let MOD_CTRL: number = 2;
export let MOD_META: number = 4;
export let MOD_SHIFT: number = 8;

export class Modifiers {
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;

  constructor() {
    this.alt = false;
    this.ctrl = false;
    this.meta = false;
    this.shift = false;
  }

  toFlags(): number {
    let flags: number = 0;
    if (this.alt) flags = flags | MOD_ALT;
    if (this.ctrl) flags = flags | MOD_CTRL;
    if (this.meta) flags = flags | MOD_META;
    if (this.shift) flags = flags | MOD_SHIFT;
    return flags;
  }
}

// ---------------------------------------------------------------------------
// CDP protocol types
// ---------------------------------------------------------------------------

export class CdpRequest {
  id: number;
  method: string;
  params: any;
  sessionId: string;

  constructor(id: number, method: string, params: any, sessionId: string) {
    this.id = id;
    this.method = method;
    this.params = params;
    this.sessionId = sessionId;
  }
}

export class CdpResponse {
  id: number;
  result: any;
  error: any;

  constructor(id: number, result: any, error: any) {
    this.id = id;
    this.result = result;
    this.error = error;
  }
}

export class CdpEvent {
  method: string;
  params: any;
  sessionId: string;

  constructor(method: string, params: any, sessionId: string) {
    this.method = method;
    this.params = params;
    this.sessionId = sessionId;
  }
}

// ---------------------------------------------------------------------------
// Target types
// ---------------------------------------------------------------------------

export class TargetInfo {
  targetId: string;
  targetType: string;
  title: string;
  url: string;
  attached: boolean;
  browserContextId: string;

  constructor(targetId: string, targetType: string, title: string, url: string, attached: boolean, browserContextId: string) {
    this.targetId = targetId;
    this.targetType = targetType;
    this.title = title;
    this.url = url;
    this.attached = attached;
    this.browserContextId = browserContextId;
  }
}

// ---------------------------------------------------------------------------
// Runtime types
// ---------------------------------------------------------------------------

export class RemoteObject {
  objectType: string;
  subtype: string;
  className: string;
  value: any;
  description: string;
  objectId: string;

  constructor(objectType: string, subtype: string, className: string, value: any, description: string, objectId: string) {
    this.objectType = objectType;
    this.subtype = subtype;
    this.className = className;
    this.value = value;
    this.description = description;
    this.objectId = objectId;
  }
}

export class ExceptionDetails {
  exceptionId: number;
  text: string;
  lineNumber: number;
  columnNumber: number;

  constructor(exceptionId: number, text: string, lineNumber: number, columnNumber: number) {
    this.exceptionId = exceptionId;
    this.text = text;
    this.lineNumber = lineNumber;
    this.columnNumber = columnNumber;
  }
}

export class EvaluateResult {
  result: RemoteObject;
  exceptionDetails: ExceptionDetails | null;

  constructor(result: RemoteObject, exceptionDetails: ExceptionDetails | null) {
    this.result = result;
    this.exceptionDetails = exceptionDetails;
  }
}

// ---------------------------------------------------------------------------
// DOM types
// ---------------------------------------------------------------------------

export class DomNode {
  nodeId: number;
  parentId: number;
  backendNodeId: number;
  nodeType: number;
  nodeName: string;
  localName: string;
  nodeValue: string;
  childNodeCount: number;
  children: DomNode[];

  constructor(
    nodeId: number, parentId: number, backendNodeId: number,
    nodeType: number, nodeName: string, localName: string,
    nodeValue: string, childNodeCount: number, children: DomNode[]
  ) {
    this.nodeId = nodeId;
    this.parentId = parentId;
    this.backendNodeId = backendNodeId;
    this.nodeType = nodeType;
    this.nodeName = nodeName;
    this.localName = localName;
    this.nodeValue = nodeValue;
    this.childNodeCount = childNodeCount;
    this.children = children;
  }
}

export class BoxModel {
  content: number[];
  padding: number[];
  border: number[];
  margin: number[];
  width: number;
  height: number;

  constructor(content: number[], padding: number[], border: number[], margin: number[], width: number, height: number) {
    this.content = content;
    this.padding = padding;
    this.border = border;
    this.margin = margin;
    this.width = width;
    this.height = height;
  }
}

// ---------------------------------------------------------------------------
// BoundingBox
// ---------------------------------------------------------------------------

export class BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;

  constructor(x: number, y: number, width: number, height: number) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }
}

// ---------------------------------------------------------------------------
// Network types
// ---------------------------------------------------------------------------

export class NetworkRequest {
  url: string;
  method: string;
  headers: any;
  postData: string;

  constructor(url: string, method: string, headers: any, postData: string) {
    this.url = url;
    this.method = method;
    this.headers = headers;
    this.postData = postData;
  }
}

export class NetworkResponse {
  url: string;
  status: number;
  statusText: string;
  headers: any;
  mimeType: string;

  constructor(url: string, status: number, statusText: string, headers: any, mimeType: string) {
    this.url = url;
    this.status = status;
    this.statusText = statusText;
    this.headers = headers;
    this.mimeType = mimeType;
  }
}

// ---------------------------------------------------------------------------
// Cookie types
// ---------------------------------------------------------------------------

export class Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  session: boolean;
  sameSite: string;

  constructor(
    name: string, value: string, domain: string, path: string,
    expires: number, httpOnly: boolean, secure: boolean,
    session: boolean, sameSite: string
  ) {
    this.name = name;
    this.value = value;
    this.domain = domain;
    this.path = path;
    this.expires = expires;
    this.httpOnly = httpOnly;
    this.secure = secure;
    this.session = session;
    this.sameSite = sameSite;
  }
}

export class CookieParam {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: string;
  expires: number;

  constructor(name: string, value: string) {
    this.name = name;
    this.value = value;
    this.domain = "";
    this.path = "/";
    this.secure = false;
    this.httpOnly = false;
    this.sameSite = "";
    this.expires = 0;
  }
}

// ---------------------------------------------------------------------------
// Header types
// ---------------------------------------------------------------------------

export class HeaderEntry {
  name: string;
  value: string;

  constructor(name: string, value: string) {
    this.name = name;
    this.value = value;
  }
}

// ---------------------------------------------------------------------------
// Request interception types
// ---------------------------------------------------------------------------

export class RequestPattern {
  urlPattern: string;
  resourceType: string;
  requestStage: string;

  constructor(urlPattern: string, resourceType: string, requestStage: string) {
    this.urlPattern = urlPattern;
    this.resourceType = resourceType;
    this.requestStage = requestStage;
  }
}

export function requestPatternAll(): RequestPattern {
  return new RequestPattern("*", "", "Request");
}

export function requestPatternUrl(pattern: string): RequestPattern {
  return new RequestPattern(pattern, "", "Request");
}

// ---------------------------------------------------------------------------
// Screenshot comparison
// ---------------------------------------------------------------------------

export let COMPARE_MATCH: string = "match";
export let COMPARE_MISMATCH: string = "mismatch";
export let COMPARE_NEW_BASELINE: string = "new_baseline";

export class CompareResult {
  kind: string;
  diffPercentage: number;
  diffImage: Uint8Array;

  constructor(kind: string, diffPercentage: number, diffImage: Uint8Array) {
    this.kind = kind;
    this.diffPercentage = diffPercentage;
    this.diffImage = diffImage;
  }

  isMatch(): boolean { return this.kind === COMPARE_MATCH; }
  isNew(): boolean { return this.kind === COMPARE_NEW_BASELINE; }
}

// ---------------------------------------------------------------------------
// Network conditions
// ---------------------------------------------------------------------------

export class NetworkConditions {
  offline: boolean;
  latency: number;
  downloadThroughput: number;
  uploadThroughput: number;

  constructor(offline: boolean, latency: number, downloadThroughput: number, uploadThroughput: number) {
    this.offline = offline;
    this.latency = latency;
    this.downloadThroughput = downloadThroughput;
    this.uploadThroughput = uploadThroughput;
  }
}

export function networkNoThrottle(): NetworkConditions {
  return new NetworkConditions(false, 0, -1, -1);
}

export function networkOffline(): NetworkConditions {
  return new NetworkConditions(true, 0, 0, 0);
}

export function networkSlow3g(): NetworkConditions {
  return new NetworkConditions(false, 2000, 50000, 50000);
}

export function networkFast3g(): NetworkConditions {
  return new NetworkConditions(false, 562.5, 180000, 84375);
}

// ---------------------------------------------------------------------------
// Storage types
// ---------------------------------------------------------------------------

export class StorageEntry {
  name: string;
  value: string;

  constructor(name: string, value: string) {
    this.name = name;
    this.value = value;
  }
}

export class OriginStorage {
  origin: string;
  localStorage: StorageEntry[];
  sessionStorage: StorageEntry[];

  constructor(origin: string, localStorage: StorageEntry[], sessionStorage: StorageEntry[]) {
    this.origin = origin;
    this.localStorage = localStorage;
    this.sessionStorage = sessionStorage;
  }
}

export class StorageState {
  cookies: Cookie[];
  origins: OriginStorage[];

  constructor(cookies: Cookie[], origins: OriginStorage[]) {
    this.cookies = cookies;
    this.origins = origins;
  }
}

// ---------------------------------------------------------------------------
// Touch point
// ---------------------------------------------------------------------------

export class TouchPoint {
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  force: number;
  id: number;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.radiusX = 1;
    this.radiusY = 1;
    this.force = 1;
    this.id = 0;
  }
}

// ---------------------------------------------------------------------------
// Page info types
// ---------------------------------------------------------------------------

export class FrameInfo {
  id: string;
  parentId: string;
  loaderId: string;
  name: string;
  url: string;

  constructor(id: string, parentId: string, loaderId: string, name: string, url: string) {
    this.id = id;
    this.parentId = parentId;
    this.loaderId = loaderId;
    this.name = name;
    this.url = url;
  }
}

export class NavigateResult {
  frameId: string;
  loaderId: string;
  errorText: string;

  constructor(frameId: string, loaderId: string, errorText: string) {
    this.frameId = frameId;
    this.loaderId = loaderId;
    this.errorText = errorText;
  }
}

// ---------------------------------------------------------------------------
// Screenshot format constants
// ---------------------------------------------------------------------------

export let SCREENSHOT_PNG: string = "png";
export let SCREENSHOT_JPEG: string = "jpeg";
export let SCREENSHOT_WEBP: string = "webp";

// ---------------------------------------------------------------------------
// Dialog types
// ---------------------------------------------------------------------------

export let DIALOG_ALERT: string = "alert";
export let DIALOG_CONFIRM: string = "confirm";
export let DIALOG_PROMPT: string = "prompt";
export let DIALOG_BEFOREUNLOAD: string = "beforeunload";

export class Dialog {
  dialogType: string;
  message: string;
  defaultValue: string;
  url: string;

  constructor(dialogType: string, message: string, defaultValue: string, url: string) {
    this.dialogType = dialogType;
    this.message = message;
    this.defaultValue = defaultValue;
    this.url = url;
  }
}

// ---------------------------------------------------------------------------
// Console message types
// ---------------------------------------------------------------------------

export let CONSOLE_LOG: string = "log";
export let CONSOLE_DEBUG: string = "debug";
export let CONSOLE_INFO: string = "info";
export let CONSOLE_WARNING: string = "warning";
export let CONSOLE_ERROR: string = "error";

export class ConsoleMessage {
  level: string;
  text: string;
  location: string;
  timestamp: number;

  constructor(level: string, text: string, location: string, timestamp: number) {
    this.level = level;
    this.text = text;
    this.location = location;
    this.timestamp = timestamp;
  }
}

export class PageError {
  exceptionId: number;
  text: string;
  lineNumber: number;
  columnNumber: number;
  url: string;
  stackTrace: string;

  constructor(exceptionId: number, text: string, lineNumber: number, columnNumber: number, url: string, stackTrace: string) {
    this.exceptionId = exceptionId;
    this.text = text;
    this.lineNumber = lineNumber;
    this.columnNumber = columnNumber;
    this.url = url;
    this.stackTrace = stackTrace;
  }
}

// ---------------------------------------------------------------------------
// HAR types (HTTP Archive)
// ---------------------------------------------------------------------------

export class HarHeader {
  name: string;
  value: string;
  constructor(name: string, value: string) { this.name = name; this.value = value; }
}

export class HarContent {
  size: number;
  mimeType: string;
  text: string;
  encoding: string;
  constructor(size: number, mimeType: string, text: string, encoding: string) {
    this.size = size; this.mimeType = mimeType; this.text = text; this.encoding = encoding;
  }
}

export class HarTimings {
  blocked: number;
  dns: number;
  connect: number;
  send: number;
  wait: number;
  receive: number;
  ssl: number;
  constructor() {
    this.blocked = -1; this.dns = -1; this.connect = -1;
    this.send = 0; this.wait = 0; this.receive = 0; this.ssl = -1;
  }
}

export class HarRequest {
  method: string;
  url: string;
  httpVersion: string;
  headers: HarHeader[];
  headersSize: number;
  bodySize: number;
  constructor(method: string, url: string) {
    this.method = method; this.url = url; this.httpVersion = "HTTP/1.1";
    this.headers = []; this.headersSize = -1; this.bodySize = -1;
  }
}

export class HarResponse {
  status: number;
  statusText: string;
  httpVersion: string;
  headers: HarHeader[];
  content: HarContent;
  headersSize: number;
  bodySize: number;
  constructor(status: number, statusText: string) {
    this.status = status; this.statusText = statusText; this.httpVersion = "HTTP/1.1";
    this.headers = []; this.content = new HarContent(0, "", "", "");
    this.headersSize = -1; this.bodySize = -1;
  }
}

export class HarEntry {
  startedDateTime: string;
  time: number;
  request: HarRequest;
  response: HarResponse;
  timings: HarTimings;
  serverIpAddress: string;
  resourceType: string;
  constructor(startedDateTime: string, request: HarRequest, response: HarResponse) {
    this.startedDateTime = startedDateTime; this.time = 0;
    this.request = request; this.response = response;
    this.timings = new HarTimings(); this.serverIpAddress = ""; this.resourceType = "";
  }
}

export class Har {
  version: string;
  creator: string;
  entries: HarEntry[];
  constructor() {
    this.version = "1.2"; this.creator = "browser-ts"; this.entries = [];
  }
}

// ---------------------------------------------------------------------------
// WebSocket interception types
// ---------------------------------------------------------------------------

export let WS_SENT: string = "sent";
export let WS_RECEIVED: string = "received";

export class WebSocketInfo {
  requestId: string;
  url: string;
  timestamp: number;
  constructor(requestId: string, url: string, timestamp: number) {
    this.requestId = requestId; this.url = url; this.timestamp = timestamp;
  }
}

export class WebSocketFrame {
  requestId: string;
  opcode: number;
  mask: boolean;
  payloadData: string;
  timestamp: number;
  direction: string;
  constructor(requestId: string, opcode: number, payloadData: string, timestamp: number, direction: string) {
    this.requestId = requestId; this.opcode = opcode; this.mask = false;
    this.payloadData = payloadData; this.timestamp = timestamp; this.direction = direction;
  }
}

// ---------------------------------------------------------------------------
// Service worker types
// ---------------------------------------------------------------------------

export let SW_STOPPED: string = "stopped";
export let SW_STARTING: string = "starting";
export let SW_RUNNING: string = "running";
export let SW_STOPPING: string = "stopping";

export class ServiceWorker {
  registrationId: string;
  scopeUrl: string;
  isDeleted: boolean;
  constructor(registrationId: string, scopeUrl: string, isDeleted: boolean) {
    this.registrationId = registrationId; this.scopeUrl = scopeUrl; this.isDeleted = isDeleted;
  }
}

// ---------------------------------------------------------------------------
// Web worker types
// ---------------------------------------------------------------------------

export let WORKER_DEDICATED: string = "worker";
export let WORKER_SHARED: string = "shared_worker";

export class WebWorker {
  targetId: string;
  url: string;
  workerType: string;
  attached: boolean;
  constructor(targetId: string, url: string, workerType: string, attached: boolean) {
    this.targetId = targetId; this.url = url; this.workerType = workerType; this.attached = attached;
  }
}

// ---------------------------------------------------------------------------
// Tracing types
// ---------------------------------------------------------------------------

export class TracingOptions {
  screenshots: boolean;
  snapshots: boolean;
  categories: string;
  constructor() {
    this.screenshots = false; this.snapshots = false; this.categories = "";
  }
}

export class TraceEvent {
  cat: string;
  name: string;
  ts: number;
  dur: number;
  ph: string;
  pid: number;
  tid: number;
  constructor(cat: string, name: string, ts: number, dur: number, ph: string, pid: number, tid: number) {
    this.cat = cat; this.name = name; this.ts = ts; this.dur = dur;
    this.ph = ph; this.pid = pid; this.tid = tid;
  }
}

export class TraceData {
  traceEvents: TraceEvent[];
  constructor() { this.traceEvents = []; }
}

// ---------------------------------------------------------------------------
// Video recording types
// ---------------------------------------------------------------------------

export let VIDEO_JPEG: string = "jpeg";
export let VIDEO_PNG: string = "png";

export class VideoRecordingOptions {
  path: string;
  format: string;
  quality: number;
  maxWidth: number;
  maxHeight: number;
  everyNthFrame: number;
  fps: number;
  constructor(path: string) {
    this.path = path; this.format = VIDEO_JPEG; this.quality = 80;
    this.maxWidth = 0; this.maxHeight = 0; this.everyNthFrame = 1; this.fps = 5;
  }
}

export class ScreencastFrame {
  data: string;
  sessionId: number;
  timestamp: number;
  constructor(data: string, sessionId: number, timestamp: number) {
    this.data = data; this.sessionId = sessionId; this.timestamp = timestamp;
  }
}

// ---------------------------------------------------------------------------
// IndexedDB types
// ---------------------------------------------------------------------------

export class DatabaseInfo {
  name: string;
  version: number;
  constructor(name: string, version: number) { this.name = name; this.version = version; }
}

export class ObjectStoreInfo {
  name: string;
  keyPath: string;
  autoIncrement: boolean;
  indexes: string[];
  constructor(name: string, keyPath: string, autoIncrement: boolean) {
    this.name = name; this.keyPath = keyPath; this.autoIncrement = autoIncrement; this.indexes = [];
  }
}

export class DataEntry {
  key: any;
  primaryKey: any;
  value: any;
  constructor(key: any, primaryKey: any, value: any) {
    this.key = key; this.primaryKey = primaryKey; this.value = value;
  }
}

// ---------------------------------------------------------------------------
// Drag data types
// ---------------------------------------------------------------------------

export class DragDataItem {
  mimeType: string;
  data: string;
  constructor(mimeType: string, data: string) { this.mimeType = mimeType; this.data = data; }
}

export class DragData {
  items: DragDataItem[];
  files: string[];
  dragOperationsMask: number;
  constructor() { this.items = []; this.files = []; this.dragOperationsMask = 1; }
}

// ---------------------------------------------------------------------------
// Browser capabilities
// ---------------------------------------------------------------------------

export class BrowserCapabilities {
  pdf: boolean;
  video: boolean;
  tracing: boolean;
  networkInterception: boolean;
  harRecording: boolean;
  screenshots: boolean;
  dialogs: boolean;
  geolocation: boolean;
  permissions: boolean;
  serviceWorkers: boolean;
  webWorkers: boolean;
  websockets: boolean;
  extensions: boolean;

  constructor() {
    this.pdf = true; this.video = true; this.tracing = true;
    this.networkInterception = true; this.harRecording = true; this.screenshots = true;
    this.dialogs = true; this.geolocation = true; this.permissions = true;
    this.serviceWorkers = true; this.webWorkers = true; this.websockets = true;
    this.extensions = false;
  }
}
