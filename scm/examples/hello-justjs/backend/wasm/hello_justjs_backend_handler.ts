// justjs#155: hello-justjs's fetchRandomUser() originally called
// jsonplaceholder.typicode.com directly from the browser -- a stand-in
// specifically because there was no real backend. Now that edge-bootstrap
// IS the backend, it makes that same real outbound call itself, through
// the granted `http-egress` capability (edge-bootstrap#63 Track C),
// instead of serving a hardcoded placeholder -- proving the capability
// path end to end for this handler, not just the transport mechanism.
//
// Compiled with:
//   justc build --target wasm --component \
//     scm/examples/wasm/hello_justjs_backend_handler.ts \
//     --output scm/examples/wasm/hello_justjs_backend_handler
class Backend {
  call(body: Uint8Array): Uint8Array {
    var responseJson: string = httpEgressCall(
      '{"url":"https://example.com/","method":"GET"}'
    );
    return new TextEncoder().encode(responseJson);
  }
}

export function fetch(body: Uint8Array): Uint8Array {
  return new Backend().call(body);
}
