/**
 * firklang · kort-skabeloner, spejl til browseren
 *
 * NØJAGTIG kopi af src/data/catalog/faellesskab-skabeloner.ts, oversat til
 * almindelig JavaScript, så afdelingssiden kan vise den rigtige korttekst
 * uden at hente appens bundt.
 *
 * Hvorfor spejlet må stå her: afdelingen skriver aldrig teksten selv — den
 * kommer fra appens egen stemme. Uden en forhåndsvisning kan et menneske
 * ikke se, hvorfor formularen spørger om "vært fra" i stedet for om en
 * beskrivelse. En forhåndsvisning, der lyver, er værre end ingen.
 *
 * Derfor holdes de to i sync af en test:
 *   src/data/catalog/faellesskab-skabeloner.spejl.test.ts
 * Ændrer nogen ordlyden ét sted uden det andet, fejler testen.
 */

export const TYPE_LABEL = {
  faellesspisning: "fællesspisning",
  aaben_kaffe: "åben kaffe",
  gaahold: "gåhold",
  banko: "banko",
  faelles_madlavning: "fælles madlavning",
  haandarbejde: "håndarbejde",
  filmaften: "filmaften",
};

export const VAERT_ROLLE_LABEL = {
  aktivitetsudvalget: "aktivitetsudvalget",
  afdelingsbestyrelsen: "afdelingsbestyrelsen",
  boligsocial: "en boligsocial medarbejder",
};

export const UGEDAG_LABEL = {
  man: "mandag",
  tir: "tirsdag",
  ons: "onsdag",
  tor: "torsdag",
  fre: "fredag",
  loer: "lørdag",
  soen: "søndag",
};

const MINI = "Kom en halv time. Gå igen, når du vil.";

/** "18:00" -> "18", "17:45" -> "17.45" (dansk klokkeslætsskrivning). */
export const formatKl = (hhmm) => {
  const [t, m] = String(hhmm).split(":");
  const time = String(Number(t));
  return m === "00" ? time : `${time}.${m}`;
};

const faktalinjer = (ctx) => {
  const linjer = [`I ${ctx.stedNavn}, kl. ${formatKl(ctx.fra)}.`];
  if (ctx.komAlene) linjer.push("Du kan komme alene.");
  if (ctx.letDansk) linjer.push("Let dansk.");
  linjer.push(ctx.alkoholfri ? "Alkoholfrit." : "Der kan købes øl og vin.");
  return linjer.join(" ");
};

const lavFoldeud = (aabning) => (ctx) =>
  `${aabning} At være blandt mennesker varmer oxytocin, også uden at sige meget. ${faktalinjer(ctx)}`;

const lavFoerFrist = (type) => (ctx) => {
  const dag = ctx.dag !== null && ctx.dag !== undefined ? ` ${ctx.dag}` : "";
  const senest = ctx.senest !== null && ctx.senest !== undefined ? `, senest ${ctx.senest}` : "";
  return `Skriv dig på til ${TYPE_LABEL[type]}${dag}. Sedlen hænger i opgangen${senest}.`;
};

const komAleneLinje = (ctx) => (ctx.komAlene ? " Du kan komme alene." : "");

export const SKABELONER = {
  faellesspisning: {
    paaDagen: (ctx) =>
      `Spis med i ${ctx.stedNavn} i aften. Kl. ${formatKl(ctx.fra)}. En fra ${ctx.vaertRolleLabel} er der fra ${formatKl(ctx.vaertFra)}.${komAleneLinje(ctx)} Tjek opslaget i opgangen.`,
    foerFrist: lavFoerFrist("faellesspisning"),
    foldeud: lavFoldeud("Din afdeling har fællesspisning i dag."),
    mini: MINI,
  },
  aaben_kaffe: {
    paaDagen: (ctx) =>
      `Der er åben kaffe i ${ctx.stedNavn} fra kl. ${formatKl(ctx.fra)}. Kom forbi, når du har tid. En fra ${ctx.vaertRolleLabel} er der fra ${formatKl(ctx.vaertFra)}.${komAleneLinje(ctx)} Tjek opslaget i opgangen.`,
    foerFrist: lavFoerFrist("aaben_kaffe"),
    foldeud: lavFoldeud("Din afdeling holder åben kaffe i dag."),
    mini: MINI,
  },
  gaahold: {
    paaDagen: (ctx) =>
      `Gå med fra ${ctx.stedNavn}. Afgang kl. ${formatKl(ctx.fra)}. En fra ${ctx.vaertRolleLabel} er der fra ${formatKl(ctx.vaertFra)}.${komAleneLinje(ctx)} Tjek opslaget i opgangen.`,
    foerFrist: lavFoerFrist("gaahold"),
    foldeud: lavFoldeud("Din afdeling går sammen i dag."),
    mini: MINI,
  },
  banko: {
    paaDagen: (ctx) =>
      `Spil banko i ${ctx.stedNavn} i aften. Kl. ${formatKl(ctx.fra)}. En fra ${ctx.vaertRolleLabel} er der fra ${formatKl(ctx.vaertFra)}.${komAleneLinje(ctx)} Tjek opslaget i opgangen.`,
    foerFrist: lavFoerFrist("banko"),
    foldeud: lavFoldeud("Din afdeling spiller banko i dag."),
    mini: MINI,
  },
  faelles_madlavning: {
    paaDagen: (ctx) =>
      `Lav mad sammen i ${ctx.stedNavn}. Kl. ${formatKl(ctx.fra)}. En fra ${ctx.vaertRolleLabel} er der fra ${formatKl(ctx.vaertFra)}.${komAleneLinje(ctx)} Tjek opslaget i opgangen.`,
    foerFrist: lavFoerFrist("faelles_madlavning"),
    foldeud: lavFoldeud("Din afdeling laver mad sammen i dag."),
    mini: MINI,
  },
  haandarbejde: {
    paaDagen: (ctx) =>
      `Tag håndarbejdet med i ${ctx.stedNavn}. Der er plads fra kl. ${formatKl(ctx.fra)}. En fra ${ctx.vaertRolleLabel} er der fra ${formatKl(ctx.vaertFra)}.${komAleneLinje(ctx)} Tjek opslaget i opgangen.`,
    foerFrist: lavFoerFrist("haandarbejde"),
    foldeud: lavFoldeud("Din afdeling mødes til håndarbejde i dag."),
    mini: MINI,
  },
  filmaften: {
    paaDagen: (ctx) =>
      `Se film i ${ctx.stedNavn} i aften. Kl. ${formatKl(ctx.fra)}. En fra ${ctx.vaertRolleLabel} er der fra ${formatKl(ctx.vaertFra)}.${komAleneLinje(ctx)} Tjek opslaget i opgangen.`,
    foerFrist: lavFoerFrist("filmaften"),
    foldeud: lavFoldeud("Din afdeling holder filmaften i dag."),
    mini: MINI,
  },
};
