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
 *   - skipWaiting + clients.claim, så en ny worker overtager FREMTIDIGE
 *     netværkskald med det samme (installations- og cache-adfærd) — den
 *     genindlæser IKKE en allerede åben fane. En åben, installeret app kan
 *     derfor blive ved med at køre den JS, der allerede er indlæst, langt ud
 *     over dette. Det opdager og retter src/data/opdatering.ts i stedet
 *     (pwa-3): den tjekker ved visibilitychange, om bundtet er skiftet, og
 *     genindlæser selv siden stille, når det er trygt.
 */
// Saettes automatisk af scripts/stempl-sw.mjs efter hver eksport, udledt af
// et indholdshash over ALLE filer i eksporten (ikke kun JS-bundtet - se
// pwa-2: cues.json og recipes.json aendrer sig uden at bundtets hash goer,
// og laa saa fast i den gamle cache paa ubestemt tid). Aendrer hashet sig
// ikke, opdager browseren aldrig at der findes en ny service worker - det
// var praecis fejlen der pinnede brugere til den version de foerst hentede.
const CACHE_VERSION = "firklang-1a5f5d0ca764";

// "./" er bevidst IKKE med: hopland.dk 308'er /firklang-app/ til
// /firklang-app (Next fjerner selv skråstregen), så den post blev altid en
// omdirigering, som Chrome afviser at vise som side. index.html er skallen.
const SKAL = [
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
];

// Bundtets filer (_expo/..., assets/...). Tom i kilden; scripts/stempl-sw.mjs
// skriver eksportens filnavne ind her. Uden dem hentes et nyt bundt gennem
// den GAMLE worker og havner i den gamle cache, som activate straks sletter,
// så den første offline-start efter en udgivelse blev en tom mørk skærm.
const BUNDT = [
  "./_expo/static/js/web/index-f4d88d4e78957a5001a026c421d0f434.js",
];

// Selve app-siden: /firklang-app/ og /firklang-app/index.html (eller / og
// /index.html på en lokal dev-server). Kun de to adresser må blive skal.
const APP_STI = new URL("./", self.location.href).pathname;
const erAppSiden = (url) => url.pathname === APP_STI || url.pathname === APP_STI + "index.html";

// Kun et rent 200 for selve app-siden må erstatte offline-skallen. fetch()
// af en navigation følger ikke omdirigeringer, så hopland.dk's 308 kommer
// tilbage som en opaqueredirect med status 0 - den blev tidligere gemt som
// index.html, og offline pegede så ud af scope.
const maaBliveSkal = (url, response) =>
  response.ok && response.type === "basic" && !response.redirected && erAppSiden(url);

// Chrome afviser et svar med redirected=true til en navigation. Er skallen
// alligevel hentet gennem en omdirigering, pakkes den om til et rent svar.
const somSide = (cached) =>
  cached.redirected
    ? new Response(cached.body, {
        status: cached.status,
        statusText: cached.statusText,
        headers: cached.headers,
      })
    : cached;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) =>
        Promise.all([
          // Én manglende fil i skallen må ikke vælte hele installationen.
          // "reload" går uden om browserens HTTP-cache: en gammel index.html
          // derfra peger på det gamle bundt, som activate straks sletter.
          Promise.allSettled(SKAL.map((u) => cache.add(new Request(u, { cache: "reload" })))),
          // Bundtet derimod skal med. Fejler det, forkastes den nye worker,
          // og den gamle bliver siddende til næste forsøg - hellere det end
          // en worker, der offline kun kan tegne en tom skærm. Navnene
          // indeholder et hash, så HTTP-cachen er ufarlig her.
          cache.addAll(BUNDT),
        ]),
      )
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

  // Eksplicit no-store (src/data/opdatering.ts's tjek af en ny udgivelse,
  // pwa-3): spring cachen helt over og lad browseren gå direkte på nettet.
  // Uden denne linje gik den forespørgsel stadig gennem den generelle
  // "statiske filer: cache-først"-gren nedenfor — den ser kun på URL'en,
  // aldrig på request.cache — og fik ALTID index.html tilbage fra cachen
  // (lagt der af navigations-grenen), uanset hvad serveren rent faktisk
  // havde. Tjekket sammenlignede dermed altid det kørende bundt med sig
  // selv, og en installeret app opdagede aldrig en ny udgivelse ad denne vej.
  if (request.cache === "no-store") return;

  // Administrationen (/admin/ og /afdeling/) ligger under samme oprindelse,
  // men er ikke en del af appen. Den skal ALDRIG røres af denne worker:
  // før navigations-grenen kun gemte selve app-siden, lagde den hvert svar
  // i cachen under "./index.html", så et enkelt besøg på /admin/ erstattede
  // appens offline-skal med administrationssiden. Og uden net ville grenen
  // vise appen i stedet for administrationen. Siderne kræver netværk alligevel.
  if (url.pathname.includes("/admin/") || url.pathname.includes("/afdeling/")) return;

  // Navigation: nettet først, så en ny udgivelse altid opdages.
  // Falder tilbage til den cachelagrede skal, når der ikke er forbindelse.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (maaBliveSkal(url, response)) {
            const copy = response.clone();
            void caches.open(CACHE_VERSION).then((c) => c.put("./index.html", copy));
          }
          return response;
        })
        .catch(() =>
          caches
            .match("./index.html")
            .then((cached) => (cached ? somSide(cached) : Response.error())),
        ),
    );
    return;
  }

  // faellesskab.json, konfiguration.json og katalog.json: nettet først, uden om
  // browserens HTTP-cache. De tre filer bærer kill switch, aflysninger af
  // arrangementer og selve indholdet - de skal nå installerede PWA'er, ikke
  // først når brugeren næste gang henter et nyt bundt. En 4 s timeout
  // (AbortController) betyder at en langsom eller død forbindelse falder
  // tilbage til den cachelagrede version i stedet for at hænge på ubestemt tid.
  if (
    url.pathname.endsWith("/faellesskab.json") ||
    url.pathname.endsWith("/konfiguration.json") ||
    url.pathname.endsWith("/katalog.json")
  ) {
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

  // Vejrtrækningens cue-lyd (.m4a): afspilles via new Audio(), som sender
  // GET med et Range-hoved (Safari starter typisk med bytes=0-1) for at
  // kunne søge i filen. Apples egen vejledning kræver byte-range-
  // understøttelse for medier på iOS. Cache.put() AFVISER samtidig et
  // 206-svar (kaster), så filen skal caches som et fuldt 200-svar — men
  // browserens Range-forespørgsel skal alligevel besvares med et rigtigt
  // 206, ellers risikerer cuen at forblive stum på iOS, online såvel som
  // offline.
  //
  // Løsning: hent/match ALTID den fulde, Range-fri kopi (ingen Range-hoved
  // kopieret fra den oprindelige forespørgsel) og cache den under selve
  // URL'en, som før. Bærer den oprindelige forespørgsel et Range-hoved,
  // skæres et 206-svar ud af den fulde krop, i stedet for at sende hele
  // filen igennem som et 200 (workbox-range-requests-mønsteret).
  if (url.pathname.endsWith(".m4a")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_VERSION);
        let fuld = await cache.match(url.href);
        if (!fuld) {
          const response = await fetch(new Request(url.href, { cache: "reload" }));
          if (response.ok && response.type === "basic") {
            void cache.put(url.href, response.clone());
          }
          fuld = response;
        }
        if (!fuld.ok) return fuld;

        const range = request.headers.get("Range");
        if (!range) return fuld;

        const bytes = new Uint8Array(await fuld.arrayBuffer());
        const total = bytes.byteLength;
        const [raaStart, raaSlut] = range.replace(/^bytes=/, "").split("-");
        let start;
        let slut;
        if (raaStart === "" && raaSlut !== "") {
          // Suffix-range ("bytes=-500"): de sidste 500 byte.
          start = Math.max(total - Number(raaSlut), 0);
          slut = total - 1;
        } else {
          start = raaStart === "" ? 0 : Number(raaStart);
          slut = raaSlut === "" ? total - 1 : Math.min(Number(raaSlut), total - 1);
        }

        if (!Number.isFinite(start) || !Number.isFinite(slut) || start >= total || start > slut) {
          return new Response(null, {
            status: 416,
            headers: { "Content-Range": `bytes */${total}` },
          });
        }

        const udsnit = bytes.slice(start, slut + 1);
        return new Response(udsnit, {
          status: 206,
          headers: {
            "Content-Range": `bytes ${start}-${slut}/${total}`,
            "Content-Length": String(udsnit.byteLength),
            "Content-Type": "audio/mp4",
            "Accept-Ranges": "bytes",
          },
        });
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
