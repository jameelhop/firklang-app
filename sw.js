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
const CACHE_VERSION = "firklang-9b14fbb16e97";

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

  // faellesskab.json og konfiguration.json: nettet først, altid uden om
  // browserens HTTP-cache. Disse to filer bærer kill switch og aflysninger
  // af arrangementer - de skal nå installerede PWA'er med det samme, ikke
  // først når brugeren næste gang henter et nyt bundt. En 4 s timeout
  // (AbortController) betyder at en langsom eller død forbindelse falder
  // tilbage til den cachelagrede version i stedet for at hænge på ubestemt tid.
  if (url.pathname.endsWith("/faellesskab.json") || url.pathname.endsWith("/konfiguration.json")) {
    event.respondWith(
      (async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        try {
          const response = await fetch(request, { cache: "no-cache", signal: controller.signal });
          clearTimeout(timeout);
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE_VERSION).then((c) => c.put(request, copy));
          }
          return response;
        } catch {
          clearTimeout(timeout);
          const cached = await caches.match(request);
          return cached ?? Response.error();
        }
      })(),
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
