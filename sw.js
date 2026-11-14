const CACHE = "nova-v1";

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      cache.addAll(["/", "/manifest.json"])
    )
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method === "GET") {
    e.respondWith(
      caches.match(e.request).then(r =>
        r || fetch(e.request)
      )
    );
  }
});
