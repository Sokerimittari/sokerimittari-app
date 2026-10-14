module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Pyyntöä ei tueta."
    });
  }

  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return res.status(503).json({
      error: "Arviointipalvelua ei ole vielä määritetty."
    });
  }

  const artist = String(req.body?.artist || "").trim();
  const song = String(req.body?.song || "").trim();

  if (!artist || !song) {
    return res.status(400).json({
      error: "Anna artisti ja kappale."
    });
  }

  const prompt = `
Arvioi seuraavan musiikkikappaleen kolme ominaisuutta
asteikolla 0–100 prosenttia.

ARTISTI: ${artist}
KAPPALE: ${song}

1. SOKERISUUS
Kuinka makeaa, melodista, siloiteltua ja helposti
lähestyttävää musiikki on? Arvioi juuri tätä kappaletta.

2. MAUSTEISUUS
Kuinka omaperäistä, särmikästä, yllätyksellistä tai
musiikillisesti poikkeavaa kappale on?

3. METALLISUUS
Kuinka raskasta ja nimenomaan metallista musiikki on?
Huomioi riffit, kitarasoundi, rytmiikka, laulutapa,
raskaus ja metallille ominaiset musiikilliset piirteet.

METALLISUUDEN VERTAILUKOHTIA:
- ABBA – Dancing Queen: 0 % tai hyvin lähellä nollaa.
- Days of the New – Touch, Peel and Stand:
  akustispohjaista rockia; ei pidä sekoittaa
  akustisuutta metallisuuteen.
- AC/DC – Back in Black: raskasta ja rouheaa rockia,
  mutta ei äärimetallia.
- Metallica – Fight Fire with Fire: erittäin metallista
  ja aggressiivista thrash metalia.
- Älä oleta, että Fight Fire with Fire on koko asteikon
  ehdoton maksimi. Sitäkin raskaampaa metallimusiikkia
  on olemassa.

Särökitara, äänekkyys tai synkkä tunnelma eivät yksin
tarkoita suurta metallisuutta.

TÄRKEÄÄ:
- Arvioi kappale, älä artistin mainetta.
- Älä keksi tietoja, jos kappale ei ole sinulle tuttu.
- Jos et tunne kappaletta riittävästi, kerro epävarmuudesta
  ja merkitse varmuudeksi "matala".
- Älä arvioi musiikin laatua tai paremmuutta.
- Perustele arviot suomeksi.
- Palauta vain JSON-objekti tässä muodossa:
{
  "sugar": 0,
  "spice": 0,
  "metal": 0,
  "explanation": "Lyhyt perustelu suomeksi.",
  "confidence": "kohtalainen"
}
`;

  try {
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL ||
            "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content:
                "Olet musiikin piirteitä vertaileva avustaja. " +
                "Ole rehellinen epävarmuudesta. Palauta vain JSON."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.2,
          max_tokens: 600,
          response_format: {
            type: "json_object"
          }
        })
      }
    );

    if (response.status === 429) {
      return res.status(429).json({
        error:
          "Arviointipalvelun käyttöraja on täynnä. " +
          "Aiemmat tulokset ovat edelleen katseltavissa."
      });
    }

    if (!response.ok) {
      return res.status(502).json({
        error: "Arviointipalvelu ei vastannut onnistuneesti."
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("Tyhjä vastaus.");
    }

    const result = JSON.parse(content);

    function percentage(value) {
      const number = Number(value);

      if (!Number.isFinite(number)) {
        throw new Error("Virheellinen prosentti.");
      }

      return Math.max(0, Math.min(100, Math.round(number)));
    }

    const item = {
      artist,
      song,
      sugar: percentage(result.sugar),
      spice: percentage(result.spice),
      metal: percentage(result.metal),
      explanation: String(
        result.explanation || "Perustelua ei saatu."
      ).slice(0, 1800),
      confidence: ["korkea", "kohtalainen", "matala"].includes(
        result.confidence
      ) ? result.confidence : "kohtalainen"
    };

    return res.status(200).json({ item });

  } catch (error) {
    console.error("Arviointivirhe:", error);

    return res.status(502).json({
      error: "Kappaleen arviointi epäonnistui."
    });
  }
};
