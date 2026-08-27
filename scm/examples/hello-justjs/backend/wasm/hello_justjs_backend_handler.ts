// justjs#155: hello-justjs's fetchRandomUser() originally called
// jsonplaceholder.typicode.com directly from the browser -- a stand-in
// specifically because there was no real backend. Now that edge-bootstrap
// IS the backend, it serves this data itself instead of merely forwarding
// to the same placeholder API (which would prove the transport mechanism
// but give edge-bootstrap nothing of its own to do). No network egress,
// no capability grant needed at all -- this is a pure payload-transform
// handler, the same shape as scm/examples/edge-ts/handler.ts.
//
// Compiled with:
//   justc build --target wasm --component \
//     scm/examples/wasm/hello_justjs_backend_handler.ts \
//     --output scm/examples/wasm/hello_justjs_backend_handler
class Backend {
  call(body: Uint8Array): Uint8Array {
    return new TextEncoder().encode(
      '{"id":1,"name":"Edge Bootstrap Backend","email":"hello@edge-bootstrap.dev","phone":"N/A -- served directly, no network call","website":"github.com/sweengineeringlabs/edge-bootstrap"}'
    );
  }
}

export function fetch(body: Uint8Array): Uint8Array {
  return new Backend().call(body);
}
