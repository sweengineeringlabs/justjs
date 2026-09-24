// Local demo host only. Keep the upstream fixed: this is not an open proxy.
const upstreamUrl = "https://jsonplaceholder.typicode.com/users/1";

export function demoUserEndpoint() {
  const configure = (server) => {
    server.middlewares.use(async (req, res, next) => {
      if (req.url !== "/api/demo-user") return next();
      res.setHeader("Content-Type", "application/json");
      if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        res.statusCode = 405;
        res.end(JSON.stringify({ error: "POST required" }));
        return;
      }
      try {
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 4096) {
            res.statusCode = 413;
            res.end(JSON.stringify({ error: "Request too large" }));
            return;
          }
        }
        let request;
        try {
          request = JSON.parse(body);
        } catch {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "Invalid JSON" }));
          return;
        }
        if (!request || request.url !== upstreamUrl ||
            (request.method ?? "GET") !== "GET" || request.body !== undefined) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "Only the demo user GET request is supported" }));
          return;
        }
        const upstream = await fetch(upstreamUrl, { signal: AbortSignal.timeout(15000) });
        res.end(JSON.stringify({
          status: upstream.status,
          statusText: upstream.statusText,
          headers: Object.fromEntries(upstream.headers),
          body: await upstream.text(),
          ok: upstream.ok,
        }));
      } catch (error) {
        res.statusCode = 502;
        res.end(JSON.stringify({ error: String(error) }));
      }
    });
  };
  return {
    name: "demo-user-endpoint",
    configureServer: configure,
    configurePreviewServer: configure,
  };
}
