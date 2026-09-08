import "../loadEnv.js";
const BASE = process.env.TRAKZEE_BASE_URL || "http://13.127.228.11/webservice";
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function tok(){const r=await fetch(`${BASE}?token=generateAccessToken`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:process.env.TRAKZEE_USERNAME,password:process.env.TRAKZEE_PASSWORD})});const j:any=await r.json();return (Array.isArray(j)?j[0]?.token:undefined)??j?.data?.[0]?.token??j?.data?.token??j?.token;}
const nameOf=(v:any)=>{const p=[v.Driver_First_Name,v.Driver_Middle_Name,v.Driver_Last_Name].filter((s:any)=>s&&s!=="--"&&String(s).trim().toLowerCase()!=="null");return p.length?p.join(" ").replace(/\s+/g," ").trim():"No Driver";};
const WANT:Record<string,string>={"AJE 8206":"Enock Banda","BAV 7847":"Mike sinkala","BAZ 5546":"Joel Muzizi","BAZ 5551":"godfrey Ngosa","BAZ 7151":"Raymond Katongo"};
async function run(){
  const seen = new Map<string,{n:string;t:string}>();
  for (let i=0;i<20;i++){
    let vs:any[]=[];
    try { const t=await tok(); const d:any=await(await fetch(`${BASE}?token=getTokenBaseLiveData&ProjectId=37`,{method:"POST",headers:{"Content-Type":"application/json","auth-code":t},body:JSON.stringify({company_names:"",vehicle_nos:"",imei_nos:"",format:"json"})})).json(); vs=d?.root?.VehicleData??d?.VehicleData??[]; } catch {}
    if (vs.length) {
      for (const [p,want] of Object.entries(WANT)) {
        const v=vs.find((x:any)=>String(x.Vehicle_No||"").trim()===p); if(!v)continue;
        const n=nameOf(v), t=String(v.Datetime||"");
        const prev=seen.get(p);
        if (!prev || prev.n!==n || prev.t!==t) {
          const tag = n.toLowerCase()===want.toLowerCase() ? "MATCH ✓" : "abhi alag";
          if (!prev) console.log(`[start] ${p.padEnd(11)} "${n}"  ${tag}   packet ${t}`);
          else if (prev.n!==n) console.log(`[BADLA] ${p.padEnd(11)} "${prev.n}" -> "${n}"  ${tag}   packet ${t}`);
          else console.log(`[naya packet] ${p.padEnd(11)} "${n}"  ${tag}   ${prev.t} -> ${t}`);
          seen.set(p,{n,t});
        }
      }
      const done = Object.entries(WANT).filter(([p,w])=>seen.get(p)?.n.toLowerCase()===w.toLowerCase()).length;
      if (done===5) { console.log("\nSAB 5 THEEK HO GAYE"); return; }
    }
    if (i<19) await sleep(180000);
  }
  console.log("\n--- watcher khatam ---");
  for (const [p,w] of Object.entries(WANT)) { const s=seen.get(p); console.log(`  ${p.padEnd(11)} "${s?.n||"?"}"  chahiye "${w}"  ${s?.n?.toLowerCase()===w.toLowerCase()?"OK":"ALAG"}`); }
}
run().catch(e=>{console.error(e);process.exit(1);});
