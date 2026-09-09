import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;

export default async function handler(req, res) {

  if (req.method !== "POST") {

    return res.status(405).json({
      error: "Method Not Allowed"
    });

  }

  if (!apiKey) {

    return res.status(500).json({
      error: "OPENAI_API_KEY is missing in Vercel."
    });

  }

  try {

    const { image } = req.body || {};

    if (!image || typeof image !== "string") {

      return res.status(400).json({
        error: "Chart image is required."
      });

    }

    const client = new OpenAI({
      apiKey: apiKey
    });

    const prompt = `
You are NEXT TRADER AI, a screenshot-based technical chart analyzer.

Analyze the uploaded trading chart carefully.

Return ONLY valid JSON.

Required format:

{
  "signal": "CALL",
  "confidence": 0,
  "trend": "BULLISH",
  "expiry": "1 minute",
  "setup": "string",
  "reasons": [
    "reason 1",
    "reason 2",
    "reason 3"
  ],
  "risk": "LOW",
  "disclaimer": "Technical analysis is probabilistic; no signal is guaranteed."
}

Allowed signal:
CALL, PUT, NO TRADE

Allowed trend:
BULLISH, BEARISH, SIDEWAYS, UNCLEAR

Allowed risk:
LOW, MEDIUM, HIGH

Rules:

- Analyze candle structure.
- Analyze trend.
- Analyze support and resistance.
- Analyze momentum.
- Look for confirmation.
- Do not guess when the chart is unclear.
- If signals conflict, return NO TRADE.
- Never claim certainty.
- Never guarantee profit.
- Confidence must be between 0 and 100.
`;

    const response = await client.responses.create({

      model: "gpt-5",

      input: [

        {
          role: "user",

          content: [

            {
              type: "input_text",
              text: prompt
            },

            {
              type: "input_image",
              image_url: image,
              detail: "high"
            }

          ]

        }

      ]

    });

    const output =
      response.output_text?.trim();

    if (!output) {

      return res.status(500).json({
        error: "AI returned an empty response."
      });

    }

    try {

      const result = JSON.parse(output);

      return res.status(200).json(result);

    } catch {

      return res.status(200).json({
        raw_analysis: output
      });

    }

  } catch (error) {

    console.error(
      "NEXT_TRADER_AI_ERROR:",
      error
    );

    return res.status(500).json({

      error:
        error?.message ||
        "AI analysis failed."

    });

  }

}
