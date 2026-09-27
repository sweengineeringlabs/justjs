// Route — network request interception. Ported from Rust route.rs.
// Node-only (uses CdpClient).

import { CdpClient } from "./cdp_client";
import { HeaderEntry } from "./types";

// ---------------------------------------------------------------------------
// RouteRequest
// ---------------------------------------------------------------------------

export class RouteRequest {
  url: string;
  method: string;
  headers: string[][];
  postData: string;
  resourceType: string;
  frameId: string;

  constructor(url: string, method: string, headers: string[][], postData: string, resourceType: string, frameId: string) {
    this.url = url;
    this.method = method;
    this.headers = headers;
    this.postData = postData;
    this.resourceType = resourceType;
    this.frameId = frameId;
  }
}

// ---------------------------------------------------------------------------
// ContinueOptions / FulfillOptions
// ---------------------------------------------------------------------------

export class ContinueOptions {
  url: string;
  method: string;
  postData: string;
  headers: HeaderEntry[];

  constructor() {
    this.url = "";
    this.method = "";
    this.postData = "";
    this.headers = [];
  }
}

export class FulfillOptions {
  status: number;
  headers: HeaderEntry[];
  body: string;
  contentType: string;

  constructor(status: number) {
    this.status = status;
    this.headers = [];
    this.body = "";
    this.contentType = "text/plain";
  }
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export class Route {
  cdp: CdpClient;
  requestId: string;
  request: RouteRequest;
  handled: boolean;

  constructor(cdp: CdpClient, requestId: string, request: RouteRequest) {
    this.cdp = cdp;
    this.requestId = requestId;
    this.request = request;
    this.handled = false;
  }

  continueRequest(options: ContinueOptions): string {
    if (this.handled) return "route already handled";
    let headersJson: string = "[";
    let i: number = 0;
    while (i < options.headers.length) {
      if (i > 0) headersJson = headersJson + ",";
      headersJson = headersJson + '{"name":"' + options.headers[i].name + '","value":"' + options.headers[i].value + '"}';
      i = i + 1;
    }
    headersJson = headersJson + "]";
    this.cdp.fetchContinueRequest(this.requestId, options.url, options.method, headersJson);
    this.handled = true;
    return this.cdp.lastError;
  }

  abort(reason: string): string {
    if (this.handled) return "route already handled";
    if (reason === "") reason = "Failed";
    this.cdp.fetchFailRequest(this.requestId, reason);
    this.handled = true;
    return this.cdp.lastError;
  }

  fulfill(options: FulfillOptions): string {
    if (this.handled) return "route already handled";
    let headersJson: string = "[";
    let needComma: boolean = false;
    if (options.contentType !== "") {
      headersJson = headersJson + '{"name":"Content-Type","value":"' + options.contentType + '"}';
      needComma = true;
    }
    let i: number = 0;
    while (i < options.headers.length) {
      if (needComma || i > 0) headersJson = headersJson + ",";
      headersJson = headersJson + '{"name":"' + options.headers[i].name + '","value":"' + options.headers[i].value + '"}';
      needComma = true;
      i = i + 1;
    }
    headersJson = headersJson + "]";
    // Base64-encode body for CDP
    let bodyB64: string = "";
    if (options.body !== "") {
      bodyB64 = Buffer.from(options.body, "utf-8").toString("base64");
    }
    this.cdp.fetchFulfillRequest(this.requestId, options.status, headersJson, bodyB64);
    this.handled = true;
    return this.cdp.lastError;
  }
}
