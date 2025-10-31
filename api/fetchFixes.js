// /api/fetchFixes.js

const SOURCE_URL = "https://generator.ryuu.lol/fixes";
const PROXIES = [
  url => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
  url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  url => `https://thingproxy.freeboard.io/fetch/${url}`,
];

// -- utilitaires ---------------------------------------------------------
async function tryFetchViaProxies(url) {
  for (const make of PROXIES) {
    try {
      const r = await fetch(make(url));
      if (!r.ok) continue;
      const type = r.headers.get("content-type") || "";
      if (type.includes("json")) {
        const j = await r.json();
        return j.contents || j;
      } else return await r.text();
    } catch (_) {}
  }
  throw new Error("Impossible de récupérer la page source");
}

async function parseFixes(html) {
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const anchors = [...doc.querySelectorAll("a.file-item, a[href$='.zip']")];
  return anchors.map(a => {
    const name = (a.querySelector(".file-name")?.textContent || a.textContent || "").trim();
    const href = a.getAttribute("href") || "";
    let absoluteUrl = href;
    try { absoluteUrl = new URL(href, SOURCE_URL).toString(); } catch {}
    return {
      name,
      url: absoluteUrl,
      size: (a.querySelector(".file-size")?.textContent || "").trim(),
    };
  }).filter(f => f.name.toLowerCase().includes(".zip"));
}

// Cherche une image SteamDB
async function getSteamImage(gameName) {
  try {
    const clean = encodeURIComponent(gameName.replace(/\.zip$/i, "").trim());
    const r = await fetch(`https://steamdb.info/api/GetSearchSuggestions/?query=${clean}`);
    const json = await r.json();
    const first = json?.results?.[0];
    if (!first) return null;
    return `https://cdn.cloudflare.steamstatic.com/steam/apps/${first.appid}/header.jpg`;
  } catch {
    return null;
  }
}

// -- handler -------------------------------------------------------------
module.exports = async function handler(req, res) {
  try {
    const html = await tryFetchViaProxies(SOURCE_URL);
    let fixes = await parseFixes(html);
    // ajoute une miniature via SteamDB
    const limited = fixes.slice(0, 50); // pour éviter de surcharger SteamDB
    await Promise.all(limited.map(async f => f.image = await getSteamImage(f.name)));

    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
    res.status(200).json({ lastUpdate: new Date().toISOString(), total: fixes.length, fixes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
