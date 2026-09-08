import "../loadEnv.js";
const BASE = process.env.TRAKZEE_BASE_URL || "http://13.127.228.11/webservice";
const WATCH = ["AJE 8206","BAZ 5546","CAD 6236","AIF 440","CAD 1792","BAZ 5551","BAV 7847"];
const nameOf = (v:any) => { const p=[v.Driver_First_Name,v.Driver_Middle_Name,v.Driver_Last_Name].filter((s:any)=>s&&s!=="--"&&String(s).trim().toLowerCase()!=="null"); return p.length?p.join(" "):"No Driver"; };
const sleep = (ms:number) => new Promise(r=>setTimeout(r,ms));
async function tok(){const r=await fetch(`${BASE}?token=generateAccessToken`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:process.env.TRAKZEE_USERNAME,password:process.env.TRAKZEE_PASSWORD})});const j:any=await r.json();return (Array.isArray(j)?j[0]?.token:undefined)??j?.data?.[0]?.token??j?.data?.token??j?.token;}
async function run(){
  const prev = new Map<string,string>();
  let reads = 0, empties = 0;
  for (let i = 0; i < 14; i++) {
    try {
      const t = await tok();
      const d:any = await (await fetch(`${BASE}?token=getTokenBaseLiveData&ProjectId=37`,{method:"POST",headers:{"Content-Type":"application/json","auth-code":t},body:JSON.stringify({company_names:"",vehicle_nos:"",imei_nos:"",format:"json"})})).json();
      const vs = d?.root?.VehicleData ?? d?.VehicleData ?? [];
      if (!vs.length) { empties++; console.log(`[read ${i}] EMPTY feed`); }
      else {
        reads++;
        for (const plate of WATCH) {
          const v = vs.find((x:any)=>String(x.Vehicle_No||x.Vehicle_Name||"").trim()===plate);
          if (!v) continue;
          const n = nameOf(v);
          if (prev.get(plate) !== n) { console.log(`[read ${i}] ${plate}  ->  "${n}"${prev.has(plate) ? `   (was "${prev.get(plate)}")` : ""}`); prev.set(plate, n); }
        }
      }
    } catch (e:any) { console.log(`[read ${i}] ERROR ${e.message}`); }
    if (i < 13) await sleep(180000);
  }
  console.log(`\nDONE. good reads=${reads} empty=${empties}`);
  console.log("final state:"); for (const [p,n] of prev) console.log(`  ${p.padEnd(12)} "${n}"`);
}
run().catch(e=>{console.error(e);process.exit(1);});
