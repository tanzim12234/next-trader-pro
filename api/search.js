import { json, currentUser } from "./store.js";

export default async function handler(req,res){
  if(req.method!=="POST"){res.setHeader("Allow","POST");return json(res,405,{error:"Method not allowed."});}
  const user=await currentUser(req);
  if(!user)return json(res,401,{error:"NEXT AI-তে লগইন করো।"});
  const query=String(req.body?.query||"").trim().slice(0,2000);
  if(!query)return json(res,400,{error:"Search query দাও।"});
  const key=process.env.GEMINI_API_KEY;
  if(!key)return json(res,503,{error:"Web search-এর জন্য GEMINI_API_KEY configure করতে হবে।"});
  const model=process.env.NEXT_AI_GEMINI_MODEL||"gemini-2.5-flash";
  const upstream=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent",{
    method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},
    body:JSON.stringify({contents:[{role:"user",parts:[{text:"Search the public web for this query. Summarize the most relevant current findings, distinguish facts from uncertainty, and cite source URLs inline. Query: "+query}]}],tools:[{google_search:{}}],generationConfig:{temperature:0.2,maxOutputTokens:1800}}),
    signal:AbortSignal.timeout(25000)
  });
  const data=await upstream.json().catch(()=>({}));
  if(!upstream.ok){console.error("NEXT AI web search error",upstream.status,data?.error?.status||"provider_error");return json(res,502,{error:"Web search provider request failed. API key, model access or quota পরীক্ষা করতে হবে।"});}
  const candidate=data?.candidates?.[0];
  const answer=(candidate?.content?.parts||[]).map(x=>x.text||"").join("").trim();
  const chunks=candidate?.groundingMetadata?.groundingChunks||[];
  const sources=chunks.map(x=>x.web).filter(x=>x?.uri).map(x=>({title:x.title||x.uri,url:x.uri})).filter((x,i,a)=>a.findIndex(y=>y.url===x.url)===i).slice(0,8);
  if(!answer)return json(res,502,{error:"Search provider empty response দিয়েছে।"});
  return json(res,200,{answer,sources,grounded:sources.length>0,model});
}
