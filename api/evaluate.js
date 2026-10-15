module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Vain POST-pyynnöt sallitaan." });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "OpenRouter API-avain puuttuu Vercelin asetuksista."
    });
  }

  const { artist, song } = req.body || {};

  if (!artist || !song) {
    return res.status(400).json({
      error: "Anna artistin ja kappaleen nimi."
    });
  }

  const prompt = `
Arvioi musiikkikappaletta: ${artist} - ${song}.

Anna kolme toisistaan riippumatonta arvoa väliltä 0-100.

SOKERISUUS:
Melodisuus, tarttuvuus, siloiteltuus ja helposti lähestyttävät pop-koukut.
Suuri arvo tarkoittaa hyvin makeaa ja helposti lähestyttävää musiikkia.

MAUSTEISUUS:
Omaperäisyys, yllätyksellisyys, särmä sekä rytminen ja harmoninen monimutkaisuus.
Suuri arvo tarkoittaa epätavallista ja yllätyksellistä musiikkia.

METALLISUUS:
Kuinka raskasta ja nimenomaan metallimusiikin kaltaista musiikki on.
Älä sekoita metallisuuteen pelkkää kovaa ääntä, synkkyyttä, säröä tai raskasta rockia.
ABBA - Dancing Queen on lähellä nollaa.
AC/DC - Back in Black on raskasta rockia, mutta ei äärimetallia.
Metallica - Fight Fire with Fire on erittäin metallinen thrash metal -kappale, mutta ei välttämättä asteikon ehdoton maksimi.

Arvioi tunnettujen tietojen perusteella. Älä väitä kuunnelleesi kappaletta.
Jos et tunne kappaletta riittävästi, ilmaise epävarmuus.
Älä arvioi kappaleen laatua äläkä anna arvosanaa.
Älä keksi varmoja yksityiskohtia.

Vastaa vain kelvollisena JSON-objektina seuraavassa muodossa:
{
  "sugar": 0,
  "spice": 0,
  "metal": 0,
  "explanation": "Lyhyt perustelu suomeksi.",
  "confidence": "matala"
}

Arvojen pitää olla kokonaislukuja 0-100.
confidence-arvo on "matala", "kohtalainen" tai "korkea".
`;

  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://sokerimittari-app.vercel.app",
          "X-Title": "Sokerimittari"
        },
        body: JSON.stringify({
          model: "thinkingmachines/inkling-small:free",
          messages: [
            {
              role: "system",
              content: "Olet musiikkia analysoiva avustaja. Vastaa vain pyydetyssä JSON-muodossa."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.3
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenRouter-virhe:", response.status, data);
      return res.status(502).json({
        error: "Musiikkipalvelu ei vastannut onnistuneesti. Tarkista myöhemmin uudelleen."
      });
    }

    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return res.status(502).json({
        error: "Musiikkipalvelu ei palauttanut arviointia."
      });
    }

    const cleaned = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    const result = JSON.parse(cleaned);

    for (const key of ["sugar", "spice", "metal"]) {
      if (
        typeof result[key] !== "number" ||
        !Number.isFinite(result[key]) ||
        result[key] < 0 ||
        result[key] > 100
      ) {
        throw new Error("Virheellinen arviointiarvo");
      }
    }

    return res.status(200).json({
      item: {
        artist,
        song,
        sugar: result.sugar,
        spice: result.spice,
        metal: result.metal,
        explanation: result.explanation || "",
        confidence: result.confidence || "matala"
      }
    });
  } catch (error) {
    console.error("Arviointivirhe:", error.message);
    return res.status(502).json({
      error: "Arvioinnin käsittely epäonnistui. Yritä uudelleen."
    });
  }
};
