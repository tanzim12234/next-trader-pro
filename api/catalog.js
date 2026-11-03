import { CATALOG } from "./catalog-data.js";
export default async function handler(req,res){
  if(req.method!=="GET"){res.setHeader("Allow","GET");return json(res,405,{error:"Method not allowed."});}
  const user=await currentUser(req);
  if(!user)return json(res,401,{error:"NEXT AI-তে লগইন করো।"});
  const q=String(req.query?.q||"").trim().toLowerCase();
  const category=String(req.query?.category||"").trim().toLowerCase();
  const items=CATALOG.filter(x=>(!q||[x.name,x.category,x.use,x.auth].join(" ").toLowerCase().includes(q))&&(!category||x.category.toLowerCase()===category));
  return json(res,200,{items,categories:[...new Set(CATALOG.map(x=>x.category))],source:"Community-curated public-apis README snapshot.",total:CATALOG.length,repository:"https://github.com/public-apis/public-apis"});
}
