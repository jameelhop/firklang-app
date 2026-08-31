/**
 * firklang · service worker
 *
 * Appen skal virke offline. Hele nudge-motoren kører på enheden, kataloget er
 * indbygget i bundtet, og logninger ligger i localStorage — så når skallen
 * først er cachelagret, er der reelt intet at hente.
 *
 * Strategi: network-first for navigation, cache-first for statiske filer.
 *
 * Expo advarer med rette om, at aggressiv cachelagring kan låse brugere fast
 * i en gammel version. Derfor:
 *   - CACHE_VERSION bumpes ved hver udgivelse og rydder alt gammelt
 *   - navigation forsøger nettet FØRST, så en ny version altid opdages
 *   - skipWaiting + clients.claim, så en ny worker tager over med det samme
 */
// Saettes automatisk af scripts/stempl-sw.mjs efter hver eksport, udledt af
// bundtets hash. Aendrer den sig ikke, opdager browseren aldrig at der findes
// en ny service worker - det var praecis fejlen der pinnede brugere til
// den version de foerst hentede.
const CACHE_VERSION = "firklang-3e15bfde4f5f";

const SKAL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      // Én manglende fil må ikke vælte hele installationen.
      .then((cache) => Promise.allSettled(SKAL.map((u) => cache.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigation: nettet først, så en ny udgivelse altid opdages.
  // Falder tilbage til den cachelagrede skal, når der ikke er forbindelse.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(CACHE_VERSION).then((c) => c.put("./index.html", copy));
          return response;
        })
        .catch(() =>
          caches
            .match("./index.html")
            .then((cached) => cached ?? caches.match("./"))
            .then((cached) => cached ?? Response.error()),
        ),
    );
    return;
  }

  // Statiske filer: cache først. Bundtnavne indeholder et hash, så en ny
  // version giver en ny URL og kan ikke serveres fra en gammel post.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          void caches.open(CACHE_VERSION).then((c) => c.put(request, copy));
        }
        return response;
      });
    }),
  );
});
