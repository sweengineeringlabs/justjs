// Ambient declarations for the jsc native runtime's WebSocket FFI —
// injected by Cranelift at compile time when running under jsc, absent
// under Node/Deno/Bun. Declared as `any` because every call site already
// casts through `as any` (see cdp_client.ts's nativeWs* wrappers); this
// file exists only so `tsc` can resolve the bare identifiers at all
// (TS2304 "Cannot find name") rather than to provide real type safety.
declare const jst_ws_connect: any;
declare const jst_ws_send_recv: any;
declare const jst_ws_get_events: any;
declare const jst_ws_close: any;
