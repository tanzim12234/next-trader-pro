import { json, currentUser } from "./store.js";

const CATALOG = [
  {category:"AI & Machine Learning",name:"Google Gemini",url:"https://ai.google.dev/gemini-api/docs",auth:"API key",pricing:"Free tier + paid",use:"NEXT AI text, vision and grounded search"},
  {category:"AI & Machine Learning",name:"OpenAI API",url:"https://platform.openai.com/docs",auth:"API key",pricing:"Paid usage",use:"Alternative language and vision models"},
  {category:"AI & Machine Learning",name:"Hugging Face",url:"https://huggingface.co/docs/api-inference",auth:"Token",pricing:"Free/paid tiers",use:"Model inference and embeddings"},
  {category:"Web Search",name:"Brave Search API",url:"https://api.search.brave.com/app/documentation",auth:"API key",pricing:"Plan dependent",use:"Web search results"},
  {category:"Web Search",name:"Tavily",url:"https://docs.tavily.com",auth:"API key",pricing:"Free/paid tiers",use:"Search designed for AI agents"},
  {category:"Web Search",name:"Google Programmable Search",url:"https://developers.google.com/custom-search/v1/overview",auth:"API key + engine ID",pricing:"Quota/paid",use:"Programmable web search"},
  {category:"Finance & Markets",name:"Binance Spot API",url:"https://developers.binance.com/docs/binance-spot-api-docs",auth:"Public endpoints; key for private",pricing:"Public market data",use:"Crypto prices, klines and exchange data"},
  {category:"Finance & Markets",name:"Alpha Vantage",url:"https://www.alphavantage.co/documentation/",auth:"API key",pricing:"Free/paid tiers",use:"Stocks, forex and indicators"},
  {category:"Finance & Markets",name:"Marketstack",url:"https://marketstack.com/documentation",auth:"API key",pricing:"Free/paid tiers",use:"Global stock market data"},
  {category:"Finance & Markets",name:"ExchangeRate.host",url:"https://exchangerate.host/documentation",auth:"Plan dependent",pricing:"Free/paid tiers",use:"Currency exchange rates"},
  {category:"Finance & Markets",name:"CoinGecko",url:"https://docs.coingecko.com",auth:"Demo/Pro API key",pricing:"Free/paid tiers",use:"Crypto market information"},
  {category:"Weather",name:"Open-Meteo",url:"https://open-meteo.com/en/docs",auth:"No key for many endpoints",pricing:"Free/non-commercial terms",use:"Weather forecasts"},
  {category:"Maps & Location",name:"OpenStreetMap",url:"https://wiki.openstreetmap.org/wiki/API",auth:"Varies by service",pricing:"Usage policy applies",use:"Open map data"},
  {category:"News",name:"NewsAPI",url:"https://newsapi.org/docs",auth:"API key",pricing:"Free/paid; terms vary",use:"News discovery"},
  {category:"Developer Tools",name:"GitHub REST API",url:"https://docs.github.com/en/rest",auth:"Public unauthenticated; token for higher limits",pricing:"Free with rate limits",use:"Repository and developer workflows"},
  {category:"Files & Storage",name:"Filestack",url:"https://www.filestack.com/docs/",auth:"API key",pricing:"Free/paid tiers",use:"File upload and transformation"},
  {category:"Email",name:"Mailersend",url:"https://developers.mailersend.com/",auth:"API token",pricing:"Free/paid tiers",use:"Transactional email"},
  {category:"Translation",name:"MyMemory Translation",url:"https://mymemory.translated.net/doc/spec.php",auth:"Optional key for higher limits",pricing:"Free limits",use:"Text translation"}
];

export default async function handler(req,res){
  if(req.method!=="GET"){res.setHeader("Allow","GET");return json(res,405,{error:"Method not allowed."});}
  const user=await currentUser(req);
  if(!user)return json(res,401,{error:"NEXT AI-তে লগইন করো।"});
  const q=String(req.query?.q||"").trim().toLowerCase();
  const category=String(req.query?.category||"").trim().toLowerCase();
  const items=CATALOG.filter(x=>(!q||[x.name,x.category,x.use,x.auth].join(" ").toLowerCase().includes(q))&&(!category||x.category.toLowerCase()===category));
  return json(res,200,{items,categories:[...new Set(CATALOG.map(x=>x.category))],source:"Curated starter catalogue; not the complete public-apis repository.",repository:"https://github.com/public-apis/public-apis"});
}
