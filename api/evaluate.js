module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Vain POST-pyynnöt sallitaan."
    });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "OpenRouter API-avain puuttuu Vercelin asetuksista."
    });
  }

  const { artist, song, type } = req.body || {};

  if (!artist || !song) {
    return res.status(400).json({
      error: "Anna artistin nimi ja kappaleen tai levyn nimi."
    });
  }

  const itemType = type === "album" ? "albumi" : "kappale";

  const prompt = `
Arvioi seuraava musiikki Sokerimittaria varten.

Kohde: ${artist} – ${song}
Arvioinnin kohde: ${itemType}

Anna kolme toisistaan riippumatonta arviota asteikolla 0–100.

1. SOKERISUUS
Arvioi musiikin melodisuutta, helposti lähestyttävyyttä,
välitöntä vetovoimaa ja tarttuvuutta.

Sokerisuusankkurit:
- MÔR – Time Slips: 0 % vertailukohta, ei absoluuttinen nolla.
- Lynyrd Skynyrd – Simple Man: 10 %
- Goose – Thatch: 20 %
- Rainbow – Catch the Rainbow: 35 %
- REO Speedwagon – Roll with the Changes: 50 %
- Journey – Don't Stop Believin': 70 %
- Bon Jovi – Livin' on a Prayer: 85 %
- Owl City – Fireflies: 100 %

Käytä ankkureita suuntaa antavina vertailukohtina.
Älä kopioi prosentteja automaattisesti, vaan arvioi musiikkia
suhteessa näihin esimerkkeihin.

2. SUOLAISUUS
Arvioi, kuinka paljon musiikki muistuttaa metallimusiikkia.
Tämä on tyylillinen arvio, ei arvio musiikin laadusta.

Suolaisuusankkurit:
- ABBA – Dancing Queen: lähellä 0 %.
- AC/DC – Back in Black: raskasta rockia, mutta ei äärimetallia.
- Metallica – Fight Fire with Fire: erittäin metallinen thrash metal.

Älä anna korkeaa suolaisuutta pelkästään siksi, että musiikki
on kovaa, säröistä, synkkää tai raskasta. Arvioi metallimusiikille
tyypillisiä piirteitä kokonaisuutena, kuten riffejä, soittotapaa,
soundia, laulutyyliä ja musiikillista ilmaisua.

3. MAUSTEISUUS
Arvioi musiikin yllätyksellisyyttä, rakenteellista vaihtelua,
instrumentaalisia osuuksia, sooloja, improvisaatiota ja
musiikillista kehittelyä.

Mausteisuus ei tarkoita samaa kuin raskaus tai metallisuus.
Musiikki voi olla hyvin mausteista, vaikka sen suolaisuus olisi matala.
Myöskään tekninen monimutkaisuus ei yksin tarkoita suurta mausteisuutta.

Huomioi versioiden erot:
- Pitkä liveversio voi olla studioversiota mausteisempi, jos siinä
  on todellista improvisaatiota, sooloja tai musiikillista kehittelyä.
- Pelkkä pitkä kesto ei nosta mausteisuutta.
- Älä oleta liveversion olevan automaattisesti studioversiota parempi
  tai mausteisempi.
- Arvioi albumia kokonaisuutena, jos kohteena on albumi.
  Huomioi albumin kappaleiden vaihtelu ja kokonaisrakenne.

Vertaa musiikkia mahdollisuuksien mukaan annettuihin ankkureihin.
Boléro ja Stravinskyn Kevätuhri voivat auttaa hahmottamaan
musiikillista kehittelyä ja yllätyksellisyyttä, mutta älä keksi niille
ennalta määrättyjä prosenttiarvoja.

YLEISET OHJEET
- Arvioi musiikkia, älä artistin mainetta tai suosiota.
- Älä anna kaikkien kolmen mittarin seurata samaa kaavaa.
- Käytä koko asteikkoa perustellusti.
- Jos et tunne kyseistä kappaletta tai albumia riittävän hyvin,
  ilmaise epävarmuus confidence-kentässä.
- Älä keksi yksityiskohtia kappaleesta tai albumista.
- Perustele arviot lyhyesti suomeksi.
- Käytä confidence-arvona yhtä seuraavista: "matala", "keskitaso", "korkea".

Vastaa vain kelvollisena JSON-objektina tässä muodossa:
{
  "sugar": 0,
  "salt": 0,
  "spice": 0,
  "explanation": "Lyhyt perustelu suomeksi.",
  "confidence": "matala"
}

Kaikkien kolmen mittarin tulee olla kokonaislukuja väliltä 0–100.
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
          model: "openrouter/free",
          messages: [
            {
              role: "system",
              content:
                "Olet musiikkia analysoiva avustaja. Vastaa vain pyydetyssä JSON-muodossa. Älä lisää markdown-aitoja tai muuta tekstiä."
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
        error:
          "Musiikkipalvelu ei vastannut onnistuneesti. Tarkista myöhemmin uudelleen."
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

    for (const key of ["sugar", "salt", "spice"]) {
      if (
        typeof result[key] !== "number" ||
        !Number.isFinite(result[key]) ||
        result[key] < 0 ||
        result[key] > 100
      ) {
        throw new Error("Virheellinen arviointiarvo: " + key);
      }
    }

    return res.status(200).json({
      item: {
        artist,
        song,
        type: itemType,
        sugar: result.sugar,
        salt: result.salt,
        spice: result.spice,
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
