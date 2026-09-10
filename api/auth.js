import { isAuthorized } from "./auth.js";

const MODEL = "gemini-3.5-flash-lite";

export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"Method Not Allowed"});
  if(!isAuthorized(req))return res.status(401).json({error:"Login required."});
  const apiKey=process.env.GEMINI_API_KEY;
  if(!apiKey)return res.status(500).json({error:"GEMINI_API_KEY is missing in Vercel."});

  try{
    const {image,settings={}}=req.body||{};
    if(!image||typeof image!=="string")return res.status(400).json({error:"Chart image is required."});
    const match=image.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if(!match)return res.status(400).json({error:"Invalid image format."});

    const mimeType=match[1],base64Image=match[2];
    const market=settings.market||"OTC";
    const timeframe=settings.timeframe||"1 minute";
    const mode=settings.mode||"STRICT SMC";
    const minConfidence=Number(settings.min_confidence||60);

    const prompt=`You are NEXT TRADER AI PRO, a conservative chart screenshot/camera-frame analyzer.

Analyze ONLY what is visible in the supplied chart. Do not invent hidden candles, broker data, indicators, prices, or future candles.

User settings:
Market: ${market}
Candle timeframe: ${timeframe}
Mode: ${mode}
Minimum confidence requested: ${minConfidence}%

Use a multi-factor framework:
1) candle structure and momentum
2) trend and moving-average context if visible
3) support/resistance and liquidity
4) liquidity sweep / equal high-low if visible
5) FVG / imbalance if visible
6) rejection/engulfing/breakout confirmation if visible
7) avoid entries directly into nearby opposing levels
8) for a 1-candle binary-style decision, require strong confirmation; otherwise NO TRADE.

Return ONLY valid JSON:
{
 "signal":"CALL|PUT|NO TRADE",
 "confidence":0,
 "trend":"BULLISH|BEARISH|SIDEWAYS|UNCLEAR",
 "expiry":"${timeframe}",
 "entry_candle":"CURRENT CANDLE|NEXT CANDLE|AFTER NEXT CANDLE|WAIT",
 "entry_instruction":"short, specific instruction describing the candle to wait for or enter on",
 "setup":"short setup name",
 "reasons":["reason 1","reason 2","reason 3","reason 4"],
 "risk":"LOW|MEDIUM|HIGH",
 "disclaimer":"Technical analysis is probabilistic; no signal is guaranteed."
}

Strict rules:
- Confidence is 0-100 and reflects visible evidence, not certainty.
- If confidence is below ${minConfidence}, use NO TRADE.
- If candles are blurry/blocked, use NO TRADE.
- If signals conflict, use NO TRADE.
- Never promise profit or say the next candle is guaranteed.
- For entry_candle, never claim CURRENT CANDLE unless the screenshot clearly shows an actionable live candle and confirmation.
- Prefer WAIT when the chart lacks confirmation.
`;

    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        contents:[{parts:[{text:prompt},{inline_data:{mime_type:mimeType,data:base64Image}}]}],
        generationConfig:{temperature:.15,responseMimeType:"application/json"}
      })
    });
    const data=await response.json();
    if(!response.ok){
      console.error("GEMINI ERROR",data);
      return res.status(response.status).json({error:data?.error?.message||"Gemini API request failed."});
    }
    const text=data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if(!text)return res.status(500).json({error:"Gemini returned an empty response."});
    try{return res.status(200).json(JSON.parse(text));}
    catch{return res.status(200).json({signal:"NO TRADE",confidence:0,trend:"UNCLEAR",expiry:timeframe,entry_candle:"WAIT",entry_instruction:"AI response was not valid JSON. Do not enter.",setup:"Response parsing issue",reasons:["Model response could not be parsed safely."],risk:"HIGH",disclaimer:"Technical analysis is probabilistic; no signal is guaranteed."});}
  }catch(error){
    console.error("NEXT TRADER ERROR",error);
    return res.status(500).json({error:error?.message||"Gemini API failed."});
  }
}
