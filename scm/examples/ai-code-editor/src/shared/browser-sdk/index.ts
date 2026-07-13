// Browser tool — TypeScript port of rustscript/tools/devtools/browser.
// Public API exports following SEA layers pattern.

// Types (WASM-safe)
export {
  Viewport, viewportDefault, viewportNew, viewportMobile,
  viewportIphone14Pro, viewportIphoneSe, viewportIpad,
  viewportDesktopHd, viewportDesktop, viewportTablet,
  LOAD_DOM_CONTENT_LOADED, LOAD_LOAD, LOAD_NETWORK_IDLE,
  MOUSE_LEFT, MOUSE_RIGHT, MOUSE_MIDDLE,
  MOD_ALT, MOD_CTRL, MOD_META, MOD_SHIFT, Modifiers,
  CdpRequest, CdpResponse, CdpEvent,
  TargetInfo, RemoteObject, ExceptionDetails, EvaluateResult,
  DomNode, BoxModel, BoundingBox,
  NetworkRequest, NetworkResponse,
  Cookie, CookieParam, HeaderEntry,
  RequestPattern, requestPatternAll, requestPatternUrl,
  COMPARE_MATCH, COMPARE_MISMATCH, COMPARE_NEW_BASELINE, CompareResult,
  NetworkConditions, networkNoThrottle, networkOffline, networkSlow3g, networkFast3g,
  StorageEntry, OriginStorage, StorageState,
  TouchPoint, FrameInfo, NavigateResult,
  SCREENSHOT_PNG, SCREENSHOT_JPEG, SCREENSHOT_WEBP,
  // Dialog types
  Dialog, DIALOG_ALERT, DIALOG_CONFIRM, DIALOG_PROMPT, DIALOG_BEFOREUNLOAD,
  // Console types
  ConsoleMessage, CONSOLE_LOG, CONSOLE_DEBUG, CONSOLE_INFO, CONSOLE_WARNING, CONSOLE_ERROR,
  PageError,
  // HAR types
  Har, HarEntry, HarRequest, HarResponse, HarHeader, HarContent, HarTimings,
  // WebSocket types
  WebSocketInfo, WebSocketFrame, WS_SENT, WS_RECEIVED,
  // Service worker types
  ServiceWorker, SW_STOPPED, SW_STARTING, SW_RUNNING, SW_STOPPING,
  // Web worker types
  WebWorker, WORKER_DEDICATED, WORKER_SHARED,
  // Tracing types
  TracingOptions, TraceData, TraceEvent,
  // Video types
  VideoRecordingOptions, ScreencastFrame, VIDEO_JPEG, VIDEO_PNG,
  // IndexedDB types
  DatabaseInfo, ObjectStoreInfo, DataEntry,
  // Drag types
  DragData, DragDataItem,
  // Browser capabilities
  BrowserCapabilities,
} from "./types";

// Video encoder (Node-only)
export {
  VideoResult, encodeAviMjpeg, readJpegDimensions, AviStreamWriter,
} from "./video_encoder";

// Error types (WASM-safe)
export {
  BrowserError,
  ERR_LAUNCH_FAILED, ERR_CONNECTION_FAILED, ERR_WEBSOCKET,
  ERR_CDP, ERR_NAVIGATION_FAILED, ERR_ELEMENT_NOT_FOUND,
  ERR_TIMEOUT, ERR_JAVASCRIPT, ERR_SCREENSHOT_FAILED,
  ERR_SCREENSHOT_MISMATCH, ERR_BROWSER_NOT_FOUND,
  ERR_BROWSER_CLOSED, ERR_PAGE_CLOSED, ERR_INVALID_ARGUMENT,
  browserError, cdpError, timeoutError, elementNotFound,
  launchFailed, screenshotFailed, jsError,
} from "./error";

// Platform (WASM-safe)
export {
  Platform, currentPlatform,
  OS_WINDOWS, OS_MACOS, OS_LINUX,
  ARCH_X64, ARCH_ARM64,
} from "./platform";

// CDP client (Node-only)
export { CdpClient } from "./cdp_client";

// Manager (Node-only)
export {
  LaunchConfig, defaultLaunchConfig, BrowserProcess,
  BROWSER_CHROME,
  findChromeBinary, findBridgeScript,
  findPersistentBridgeScript, findRelayScript,
  launchBrowserProcess, getNextPort,
  getWsUrl, waitForDebugger,
} from "./manager";

// Server utilities (Node-only)
export {
  isPortAvailable, isServerRunning,
  findAvailablePort, extractPortFromUrl,
} from "./server";

// Element (Node-only)
export { Element } from "./element";

// Page (Node-only)
export { Page } from "./page";

// Browser (Node-only)
export { Browser, BrowserContext } from "./browser";

// Locator (Node-only)
export {
  Locator, LocatorFilter,
  FILTER_HAS_TEXT, FILTER_HAS_TEXT_EXACT, FILTER_HAS_ATTRIBUTE,
  FILTER_NTH, FILTER_FIRST, FILTER_LAST, FILTER_VISIBLE,
  ROLE_BUTTON, ROLE_CHECKBOX, ROLE_COMBOBOX, ROLE_DIALOG,
  ROLE_HEADING, ROLE_LINK, ROLE_LIST, ROLE_LISTITEM,
  ROLE_MENU, ROLE_MENUITEM, ROLE_NAVIGATION, ROLE_PROGRESSBAR,
  ROLE_RADIO, ROLE_SEARCH, ROLE_SEARCHBOX, ROLE_SLIDER,
  ROLE_TAB, ROLE_TABPANEL, ROLE_TABLE, ROLE_TEXTBOX,
  ROLE_TREE, ROLE_TREEITEM,
} from "./locator";

// Route (Node-only)
export {
  Route, RouteRequest, ContinueOptions, FulfillOptions,
} from "./route";

// Screenshot comparison (Node-only for file I/O, WASM-safe math)
export {
  ScreenshotDiffer, pixelsDiffer,
} from "./screenshot";
