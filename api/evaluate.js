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
Analyze this music for the Sugar Meter.

Artist: ${artist}
Title: ${song}
Type: ${itemType}

Give three independent scores from 0 to 100.

1. SUGAR
Measures melody, catchiness, immediate appeal, and accessibility.

Sugar reference points:
- MÔR – Time Slips: 0%, a reference point, not an absolute zero.
- Lynyrd Skynyrd – Simple Man: 10%.
- Goose – Thatch: 20%.
- Rainbow – Catch the Rainbow: 35%.
- REO Speedwagon – Roll with the Changes: 50%.
- Journey – Don't Stop Believin': 70%.
- Bon Jovi – Livin' on a Prayer: 85%.
- Owl City – Fireflies: 100%.

Use these as approximate reference points, not automatic scores.

2. SALT
Measures how much the music resembles heavy metal.

Salt reference points:
- ABBA – Dancing Queen: close to 0%.
- AC/DC – Back in Black: heavy rock, but not extreme metal.
- Metallica – Fight Fire with Fire: highly metallic thrash metal.

Do not give a high Salt score simply because music is loud, distorted,
dark, or heavy. Consider riffs, playing style, sound, vocal style,
and the overall musical character.

3. SPICE
Measures musical variety, unpredictability, instrumental passages,
solos, improvisation, and musical development.

Spice is independent of Salt. Music can be highly spicy without
sounding like metal. Technical complexity alone does not guarantee
a high score.

Consider different versions carefully:
- A long live version can be spicier than a studio version when it
  contains genuine improvisation, solos, or musical development.
- Duration alone does not increase Spice.
- Do not assume that every live version is automatically spicier.
- For an album, assess the album as a whole, including variation
  between tracks and its overall structure.

Stravinsky's The Rite of Spring and Ravel's Boléro may serve as
general musical reference points for development and variation.
Do not invent fixed percentage scores for them.

GENERAL RULES
- Evaluate the music, not the artist's fame or popularity.
- Keep all three scores independent.
- Use the full scale thoughtfully.
- Do not invent musical details.
- If you do not know the specific recording or album well enough,
  reflect that uncertainty in the confidence field.
- Write the explanation in natural, concise English.
- Avoid generic filler, awkward phrasing, and overly formal language.
- Be specific about the musical characteristics that support the scores.
- A little wit is welcome when appropriate, but do not force jokes.
- Confidence must be one of: "low", "medium", "high".

Return only a valid JSON object:
{
  "sugar": 0,
  "salt": 0,
  "spice": 0,
  "explanation": "A short, natural English explanation.",
  "confidence": "low"
}

All three scores must be integers between 0 and 100.
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
                "You are a music analysis assistant. Return only the requested valid JSON. Write the explanation in natural English. Do not use Markdown fences."
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
        confidence: result.confidence || "low"
      }
    });
  } catch (error) {
    console.error("Arviointivirhe:", error.message);
    return res.status(502).json({
      error: "Arvioinnin käsittely epäonnistui. Yritä uudelleen."
    });
  }
};
