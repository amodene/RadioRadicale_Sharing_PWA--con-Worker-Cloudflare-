export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. Gestione Preflight CORS per richieste Web Browser da GitHub Pages
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (request.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    // 2. Estrazione e validazione parametro Data (YYYY-MM-DD)
    const today = new Date().toISOString().split("T")[0];
    const targetDate = url.searchParams.get("date") || today;
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

    if (!dateRegex.test(targetDate)) {
      return new Response(
        JSON.stringify({ error: "Formato data non valido. Usare YYYY-MM-DD." }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }

    // 3. Controllo Cache Edge di Cloudflare
    const cacheUrl = new URL(request.url);
    const cacheKey = new Request(cacheUrl.toString(), request);
    const cache = caches.default;
    let response = await cache.match(cacheKey);

    if (response) {
      return response;
    }

    // 4. Scraping Upstream verso Radio Radicale
    const targetUrl = `https://www.radioradicale.it/riascolta?data=${targetDate}`;
    const upstreamResponse = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RadioRadicalePWA/1.0)",
        Accept: "text/html",
      },
    });

    if (!upstreamResponse.ok) {
      return new Response(
        JSON.stringify({
          error: `Errore sorgente Radio Radicale: HTTP ${upstreamResponse.status}`,
        }),
        {
          status: 502,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }

    const html = await upstreamResponse.text();

    // 5. Parsing row-by-row resiliente della tabella palinsesto
    const items = parseScheduleHtml(html, targetUrl);

    const payload = {
      date: targetDate,
      sourceUrl: targetUrl,
      count: items.length,
      items: items,
    };

    // Cache: 24h per date passate, 5 minuti per la data odierna
    const maxAge = targetDate < today ? 86400 : 300;

    response = new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": `public, max-age=${maxAge}`,
      },
    });

    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  },
};

/**
 * Parsing row-by-row della tabella palinsesto.
 * Isola ogni riga <tr> per evitare disallineamenti tra orario e trasmissione.
 */
function parseScheduleHtml(html, baseUrl) {
  const items = [];

  const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) return items;

  const trMatches = tableMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];

  for (const tr of trMatches) {
    const tdMatches = tr.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
    if (!tdMatches || tdMatches.length < 2) continue;

    // Colonna 1: Orario (estrae il testo dentro <strong> o direttamente nel <td>)
    const tdTime = tdMatches[0];
    const timeMatch =
      tdTime.match(/<strong[^>]*>([\s\S]*?)<\/strong>/i) ||
      tdTime.match(/<td[^>]*>([\s\S]*?)<\/td>/i);
    const rawTime = timeMatch ? cleanText(timeMatch[1]) : "";

    // Salta righe di intestazione prive di formato orario valido (es. "HH:MM")
    if (!rawTime || !/^\d{1,2}[:.]\d{2}/.test(rawTime)) continue;

    // Colonna 2: Contenuto / ID trasmissione
    const tdContent = tdMatches[1];
    const anchorMatch = tdContent.match(/<a\s+([^>]*?)>([\s\S]*?)<\/a>/i);

    let id = null;
    let title = "";

    if (anchorMatch) {
      const attributes = anchorMatch[1];
      const rawTitle = anchorMatch[2];
      const idAttr = attributes.match(/id=["'](.*?)["']/i);
      id = idAttr ? idAttr[1].trim() : null;
      title = cleanText(rawTitle);
    } else {
      title = cleanText(tdContent.replace(/<[^>]+>/g, ""));
    }

    if (!title) continue;

    const shareUrl = id ? `${baseUrl}#o=${id}` : baseUrl;

    items.push({
      id: id,
      time: rawTime,
      title: title,
      shareUrl: shareUrl,
    });
  }

  return items;
}

function cleanText(input) {
  return input
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
