"use client";

import { useState, useEffect, useRef } from "react";

const ASSETS = [
  { id:"eth",   sym:"ETH",   name:"Ethereum",   icon:"Ξ",  clr:"#627EEA", ltv:0.80, cgId:"ethereum"     },
  { id:"wbtc",  sym:"WBTC",  name:"Bitcoin",    icon:"₿",  clr:"#F7931A", ltv:0.70, cgId:"bitcoin"      },
  { id:"steth", sym:"stETH", name:"Lido stETH", icon:"Ξ",  clr:"#00C2FF", ltv:0.75, cgId:"staked-ether" },
  { id:"sol",   sym:"SOL",   name:"Solana",     icon:"◎",  clr:"#9945FF", ltv:0.65, cgId:"solana"       },
];
const DEBTS = [
  { id:"cc",       name:"Credit Card",   icon:"💳", rate:22.5 },
  { id:"personal", name:"Personal Loan", icon:"🏦", rate:11.2 },
  { id:"auto",     name:"Auto Loan",     icon:"🚗", rate:7.8  },
  { id:"student",  name:"Student Loan",  icon:"🎓", rate:6.5  },
];
const CHAINS = [
  { id:1,     name:"Ethereum", short:"ETH",  clr:"#627EEA", icon:"Ξ"  },
  { id:8453,  name:"Base",     short:"BASE", clr:"#0052FF", icon:"🔵" },
  { id:42161, name:"Arbitrum", short:"ARB",  clr:"#28A0F0", icon:"⚡" },
];
const PROTOCOLS = [
  { id:"morpho",   name:"Morpho Blue",  icon:"🔵", badge:"Lowest Rate",    badgeClr:"#4fffb0", tvl:"$4.2B",  fb:2.42 },
  { id:"aave",     name:"Aave V3",      icon:"👻", badge:"Most Liquid",    badgeClr:"#9945FF", tvl:"$27.1B", fb:2.87 },
  { id:"compound", name:"Compound V3",  icon:"🏦", badge:"Battle-Tested",  badgeClr:"#00A3FF", tvl:"$3.8B",  fb:3.10 },
];
const STEPS = ["Debt","Collateral","Protocol","Execute"];

const fmt  = (n,d=0)=> Number(n).toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d});
const fmtU = (n)    => `$${fmt(n,0)}`;
const sleep= ms     => new Promise(r=>setTimeout(r,ms));
const rndHex=(l=64) => Array.from({length:l},()=>"0123456789abcdef"[Math.random()*16|0]).join("");

function useSpring(target, ms=700){
  const [v,set]=useState(target);
  const raf=useRef(); const prev=useRef(target);
  useEffect(()=>{
    const s=prev.current,e=target,t0=performance.now();
    cancelAnimationFrame(raf.current);
    const tick=now=>{
      const p=Math.min((now-t0)/ms,1),ease=1-Math.pow(1-p,3);
      set(s+(e-s)*ease);
      if(p<1) raf.current=requestAnimationFrame(tick); else prev.current=e;
    };
    raf.current=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(raf.current);
  },[target,ms]);
  return v;
}

async function fetchRates(){
  try{
    const r=await fetch("https://yields.llama.fi/pools",{signal:AbortSignal.timeout(7000)});
    if(!r.ok) throw 0;
    const {data=[]}=await r.json();
    const get=(proj,sym)=>data.find(p=>p.project===proj&&p.chain==="Ethereum"&&(p.symbol||"").includes(sym));
    const a=get("aave-v3","USDC"),m=get("morpho-blue","USDC"),c=get("compound-v3","USDC");
    return{aave:a?+a.apyBaseBorrow.toFixed(2):2.87,morpho:m?+m.apyBaseBorrow.toFixed(2):2.42,compound:c?+c.apyBaseBorrow.toFixed(2):3.10,src:"DefiLlama",ts:Date.now()};
  }catch{return{aave:2.87,morpho:2.42,compound:3.10,src:"Cached",ts:Date.now()};}
}

async function fetchPrices(){
  try{
    const r=await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum,bitcoin,staked-ether,solana&vs_currencies=usd",{signal:AbortSignal.timeout(7000)});
    if(!r.ok) throw 0;
    const d=await r.json();
    return{eth:d.ethereum?.usd||3241,wbtc:d.bitcoin?.usd||86420,steth:d["staked-ether"]?.usd||3198,sol:d.solana?.usd||178};
  }catch{return{eth:3241,wbtc:86420,steth:3198,sol:178};}
}

async function getAI(p){
  const prompt=`You are RefiFi's concise AI advisor.
Debt: $${fmt(p.debt)} ${p.dtype} at ${p.rate}% APR. Collateral: ${p.qty} ${p.asset.sym} (~$${fmt(p.val)}). DeFi borrow: ${p.proto} at ${p.dr}%. Annual savings: $${fmt(p.savings)}. Health factor: ${p.hf.toFixed(2)}.
Reply ONLY as JSON (no markdown): {"verdict":"strong_yes|yes|caution|no","headline":"≤10 words","insight":"2 sentences","risk":"1 sentence","tip":"1 sentence"}`;
  try{
    const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:320,messages:[{role:"user",content:prompt}]})});
    const d=await r.json();
    return JSON.parse((d.content?.[0]?.text||"{}").replace(/```json|```/g,"").trim());
  }catch{
    return{verdict:"yes",headline:"Solid opportunity to cut your interest costs",insight:"Your collateral ratio is healthy and the rate differential is significant. This refinance makes strong financial sense.",risk:"Watch your health factor if crypto prices drop more than 30%.",tip:"Consider keeping a 20% buffer above minimum collateral as a safety net."};
  }
}

const mockW3={
  connect:async t=>{await sleep(1100);return{addr:"0x"+rndHex(40),chain:1,type:t};},
  approve:async()=>{await sleep(1700);return{hash:"0x"+rndHex(64),ok:true};},
  supply: async()=>{await sleep(2100);return{hash:"0x"+rndHex(64),ok:true};},
  borrow: async()=>{await sleep(1900);return{hash:"0x"+rndHex(64),ok:true};},
  ramp:   async()=>{await sleep(1400);return{hash:"0x"+rndHex(64),ok:true};},
};

// ─── MICRO UI ────────────────────────────────────────────────────────────────
const Spin=({sz=14,clr="#4fffb0"})=><span style={{display:"inline-block",width:sz,height:sz,border:`2px solid ${clr}30`,borderTopColor:clr,borderRadius:"50%",animation:"spin .65s linear infinite"}}/>;
const Tag=({ch,clr="#4fffb0"})=><span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 8px",borderRadius:100,fontSize:9,fontWeight:800,letterSpacing:".07em",textTransform:"uppercase",background:`${clr}12`,color:clr,border:`1px solid ${clr}22`}}>{ch}</span>;
const Bar=({pct,clr="#4fffb0",h=4})=><div style={{height:h,borderRadius:h,background:"#111828",overflow:"hidden"}}><div style={{height:"100%",width:`${Math.max(0,Math.min(100,pct))}%`,background:clr,borderRadius:h,transition:"width .55s cubic-bezier(.4,0,.2,1)"}}/></div>;

function Overlay({children,onClose}){
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(2,4,12,.85)",backdropFilter:"blur(14px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:16}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#090d1b",border:"1px solid rgba(255,255,255,.09)",borderRadius:22,padding:28,width:"100%",maxWidth:400,position:"relative",maxHeight:"88vh",overflowY:"auto",animation:"popIn .18s ease"}}>
        <button onClick={onClose} style={{position:"absolute",top:14,right:14,width:28,height:28,borderRadius:8,background:"rgba(255,255,255,.06)",border:"none",color:"#5a6280",fontSize:17,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
        {children}
      </div>
    </div>
  );
}

function WalletModal({onConnect,onClose}){
  const [busy,setBusy]=useState(null);
  const ws=[{id:"metamask",name:"MetaMask",icon:"🦊",sub:"Browser extension"},{id:"walletconnect",name:"WalletConnect",icon:"🔗",sub:"Scan with mobile"},{id:"rainbow",name:"Rainbow",icon:"🌈",sub:"iOS & Android"},{id:"coinbase",name:"Coinbase Wallet",icon:"🔵",sub:"Simple self-custody"}];
  return(
    <Overlay onClose={onClose}>
      <h3 style={{fontSize:20,fontWeight:900,letterSpacing:"-0.02em",marginBottom:4}}>Connect Wallet</h3>
      <p style={{fontSize:13,color:"#4a5580",marginBottom:20}}>Non-custodial · Your keys, your funds</p>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {ws.map(w=>(
          <button key={w.id} onClick={async()=>{setBusy(w.id);const r=await mockW3.connect(w.id);onConnect(r);}} disabled={!!busy}
            style={{display:"flex",alignItems:"center",gap:12,padding:"13px 15px",background:busy===w.id?"rgba(79,255,176,.06)":"rgba(255,255,255,.025)",border:`1px solid ${busy===w.id?"rgba(79,255,176,.35)":"rgba(255,255,255,.07)"}`,borderRadius:12,cursor:"pointer",textAlign:"left",opacity:busy&&busy!==w.id?.35:1,transition:"all .15s",fontFamily:"inherit"}}>
            <span style={{fontSize:22,width:30,textAlign:"center"}}>{w.icon}</span>
            <div style={{flex:1}}><div style={{fontSize:14,fontWeight:700,color:"#dde0f0"}}>{w.name}</div><div style={{fontSize:11,color:"#2a3568"}}>{w.sub}</div></div>
            {busy===w.id?<Spin/>:<span style={{color:"#2a3568"}}>→</span>}
          </button>
        ))}
      </div>
    </Overlay>
  );
}

function RampModal({amount,onClose}){
  const [prov,setProv]=useState("sardine");
  const [ph,setPh]=useState("select");
  const ps=[{id:"sardine",name:"Sardine",fee:.5,time:"Instant",icon:"🐟",sub:"Lowest fees"},{id:"ramp",name:"Ramp Network",fee:.9,time:"~2 min",icon:"⚡",sub:"US & EU"},{id:"transak",name:"Transak",fee:1.0,time:"~5 min",icon:"🔄",sub:"140+ countries"}];
  const ch=ps.find(p=>p.id===prov);
  return(
    <Overlay onClose={onClose}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
        <div style={{width:36,height:36,borderRadius:10,background:"rgba(79,255,176,.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17}}>💸</div>
        <div><h3 style={{fontSize:18,fontWeight:900,letterSpacing:"-0.02em"}}>Fiat Off-Ramp</h3><p style={{fontSize:11,color:"#4a5580"}}>{fmtU(amount)} USDC → USD</p></div>
      </div>
      {ph==="select"&&<>
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
          {ps.map(p=>(
            <button key={p.id} onClick={()=>setProv(p.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",background:prov===p.id?"rgba(79,255,176,.06)":"rgba(255,255,255,.025)",border:`1px solid ${prov===p.id?"rgba(79,255,176,.4)":"rgba(255,255,255,.07)"}`,borderRadius:11,cursor:"pointer",textAlign:"left",fontFamily:"inherit"}}>
              <span style={{fontSize:18}}>{p.icon}</span>
              <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:"#dde0f0"}}>{p.name}</div><div style={{fontSize:11,color:"#2a3568"}}>{p.sub}</div></div>
              <div style={{textAlign:"right"}}><div style={{fontSize:12,fontWeight:700,color:prov===p.id?"#4fffb0":"#5a6590"}}>{p.fee}%</div><div style={{fontSize:10,color:"#2a3568"}}>{p.time}</div></div>
              {prov===p.id&&<span style={{color:"#4fffb0",fontSize:13}}>✓</span>}
            </button>
          ))}
        </div>
        <div style={{background:"rgba(255,255,255,.025)",borderRadius:11,padding:14,marginBottom:14}}>
          {[["You send",`${fmtU(amount)} USDC`,"#9098b0"],["Fee ("+ch?.fee+"%)","−"+fmtU(amount*(ch?.fee/100)),"#ff8080"],["You receive",fmtU(amount*(1-ch?.fee/100)),"#4fffb0"]].map(([l,v,c],i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:i<2?"1px solid rgba(255,255,255,.04)":"none"}}>
              <span style={{fontSize:12,color:"#4a5580"}}>{l}</span>
              <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:13,fontWeight:700,color:c}}>{v}</span>
            </div>
          ))}
        </div>
        <button onClick={()=>setPh("processing")} style={{width:"100%",padding:13,background:"#4fffb0",color:"#04060f",border:"none",borderRadius:11,fontSize:14,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>Proceed with {ch?.name} →</button>
      </>}
      {ph==="processing"&&(
        <div style={{paddingTop:10}}>
          {["Locking USDC in escrow","Verifying destination bank","Initiating ACH transfer","Confirmation sent"].map((s,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:i<3?"1px solid rgba(255,255,255,.04)":"none"}}>
              <div style={{width:20,height:20,borderRadius:"50%",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",background:i<2?"rgba(79,255,176,.12)":i===2?"rgba(240,180,41,.12)":"rgba(42,53,104,.3)",border:`1px solid ${i<2?"rgba(79,255,176,.3)":i===2?"rgba(240,180,41,.3)":"rgba(42,53,104,.4)"}`}}>
                {i<2?<span style={{fontSize:10,color:"#4fffb0"}}>✓</span>:i===2?<Spin sz={10} clr="#f0b429"/>:<span style={{width:5,height:5,borderRadius:"50%",background:"#2a3568",display:"block"}}/>}
              </div>
              <span style={{fontSize:13,color:i<2?"#4fffb0":i===2?"#f0b429":"#2a3568"}}>{s}</span>
            </div>
          ))}
          <div style={{marginTop:16,padding:"12px 14px",background:"rgba(79,255,176,.05)",borderRadius:11,border:"1px solid rgba(79,255,176,.12)",textAlign:"center"}}>
            <div style={{fontSize:13,fontWeight:700,color:"#4fffb0",marginBottom:3}}>Transfer in progress</div>
            <div style={{fontSize:11,color:"#3a4568"}}>Arrives in 1–2 business days via ACH</div>
          </div>
        </div>
      )}
    </Overlay>
  );
}

function AIPanel({data,loading}){
  const cfg={strong_yes:{l:"Strong Opportunity",c:"#4fffb0"},yes:{l:"Good Move",c:"#4fffb0"},caution:{l:"Proceed Carefully",c:"#f0b429"},no:{l:"Not Recommended",c:"#ff6b6b"}};
  const v=cfg[data?.verdict]||cfg.yes;
  if(loading) return(
    <div style={{padding:16,background:"rgba(99,102,241,.05)",border:"1px solid rgba(99,102,241,.12)",borderRadius:13,display:"flex",gap:12,alignItems:"center"}}>
      <Spin sz={16} clr="#818cf8"/>
      <div><div style={{fontSize:12,fontWeight:700,color:"#818cf8",marginBottom:2}}>AI Advisor analyzing…</div><div style={{fontSize:11,color:"#2a3568"}}>Reviewing your numbers</div></div>
    </div>
  );
  if(!data) return null;
  return(
    <div style={{background:`${v.c}05`,border:`1px solid ${v.c}20`,borderRadius:13,overflow:"hidden"}}>
      <div style={{padding:"11px 15px",borderBottom:"1px solid rgba(255,255,255,.04)",display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:13}}>🤖</span>
        <span style={{fontSize:9,fontWeight:800,letterSpacing:".08em",color:"#818cf8",textTransform:"uppercase"}}>AI Advisor</span>
        <Tag ch={v.l} clr={v.c}/>
      </div>
      <div style={{padding:15}}>
        <p style={{fontSize:14,fontWeight:700,color:"#dde0f0",marginBottom:9,lineHeight:1.35}}>"{data.headline}"</p>
        <p style={{fontSize:12,color:"#5a6a90",lineHeight:1.65,marginBottom:10}}>{data.insight}</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div style={{fontSize:11,padding:"8px 10px",background:"rgba(255,107,107,.05)",borderRadius:8,borderLeft:"2px solid rgba(255,107,107,.25)",color:"#7080a0",lineHeight:1.55}}>
            <div style={{color:"#ff8080",fontWeight:800,marginBottom:3,fontSize:10}}>⚠ RISK</div>{data.risk}
          </div>
          <div style={{fontSize:11,padding:"8px 10px",background:"rgba(79,255,176,.05)",borderRadius:8,borderLeft:"2px solid rgba(79,255,176,.22)",color:"#7080a0",lineHeight:1.55}}>
            <div style={{color:"#4fffb0",fontWeight:800,marginBottom:3,fontSize:10}}>💡 TIP</div>{data.tip}
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniChart({annual}){
  const pts=Array.from({length:6},(_,i)=>({x:i,v:annual*(i+1)}));
  const maxV=pts[5].v*1.08;
  const W=240,H=72;
  const cx=i=>14+(i/5)*(W-28);
  const cy=v=>H-8-((v/maxV)*(H-16));
  const d=pts.map((p,i)=>`${i?"L":"M"}${cx(p.x)} ${cy(p.v)}`).join(" ");
  return(
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{overflow:"visible",display:"block"}}>
      <defs><linearGradient id="cg" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#4fffb0" stopOpacity=".2"/><stop offset="100%" stopColor="#4fffb0" stopOpacity="0"/></linearGradient></defs>
      <path d={`${d} L${cx(5)} ${H} L${cx(0)} ${H}Z`} fill="url(#cg)"/>
      <path d={d} fill="none" stroke="#4fffb0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      {pts.map((p,i)=>(
        <g key={i}>
          <circle cx={cx(p.x)} cy={cy(p.v)} r="2.5" fill="#4fffb0"/>
          <text x={cx(p.x)} y={H} textAnchor="middle" fill="#1e2540" fontSize="8.5">Y{p.x+1}</text>
        </g>
      ))}
    </svg>
  );
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
export default function RefiFi(){
  const [step,setStep]    = useState(0);
  const [tab,setTab]      = useState("wizard");
  const [debt,setDebt]    = useState(15000);
  const [dtype,setDtype]  = useState("cc");
  const [crate,setCrate]  = useState(22.5);
  const [aid,setAid]      = useState("eth");
  const [qty,setQty]      = useState(10);
  const [proto,setProto]  = useState("morpho");
  const [chain,setChain]  = useState(1);
  const [wallet,setWallet]= useState(null);
  const [showWM,setShowWM]= useState(false);
  const [showRM,setShowRM]= useState(false);
  const [rates,setRates]  = useState({aave:2.87,morpho:2.42,compound:3.10,src:"Loading",ts:0});
  const [prices,setPrices]= useState({eth:3241,wbtc:86420,steth:3198,sol:178});
  const [rLd,setRLd]      = useState(true);
  const [pLd,setPLd]      = useState(true);
  const [txRows,setTxRows]= useState([]);
  const [txBusy,setTxBusy]= useState(false);
  const [txDone,setTxDone]= useState(false);
  const [ai,setAi]        = useState(null);
  const [aiLd,setAiLd]    = useState(false);
  const [chainDd,setChainDd]=useState(false);

  const asset   = ASSETS.find(a=>a.id===aid);
  const price   = prices[aid]||3241;
  const colVal  = price*qty;
  const maxB    = colVal*asset.ltv;
  const canCov  = maxB>=debt;
  const dRate   = rates[proto]||2.42;
  const savings = debt*(crate-dRate)/100;
  const hf      = colVal*asset.ltv/Math.max(debt,1);
  const liqPx   = price*(debt/(colVal*asset.ltv));
  const util    = (debt/Math.max(maxB,1))*100;
  const hfClr   = hf>2?"#4fffb0":hf>1.5?"#f0b429":"#ff6b6b";
  const chainI  = CHAINS.find(c=>c.id===chain);

  const aSav = useSpring(savings);
  const aHF  = useSpring(hf);

  useEffect(()=>{
    setRLd(true);setPLd(true);
    fetchRates().then(r=>{setRates(r);setRLd(false);});
    fetchPrices().then(p=>{setPrices(p);setPLd(false);});
    const iv=setInterval(()=>{fetchRates().then(setRates);fetchPrices().then(setPrices);},60000);
    return()=>clearInterval(iv);
  },[]);

  useEffect(()=>{
    if(step===3&&!ai&&!aiLd){
      setAiLd(true);
      getAI({debt,dtype,rate:crate,asset,qty,val:colVal,dr:dRate,savings,hf,proto}).then(r=>{setAi(r);setAiLd(false);});
    }
  },[step]);

  const runTx=async()=>{
    if(!wallet){setShowWM(true);return;}
    setTxBusy(true);setTxDone(false);
    const defs=[
      {label:`Approve ${asset.sym} for Aave V3`,fn:"approve"},
      {label:`Deposit ${qty} ${asset.sym} as collateral`,fn:"supply"},
      {label:`Borrow ${fmtU(debt)} USDC at ${dRate}% APR`,fn:"borrow"},
      {label:`Off-ramp ${fmtU(debt)} USDC → USD`,fn:"ramp"},
    ];
    setTxRows(defs.map(d=>({...d,status:"pending",hash:null})));
    for(let i=0;i<defs.length;i++){
      setTxRows(p=>p.map((r,j)=>j===i?{...r,status:"loading"}:r));
      await sleep(200);
      try{
        const res=await mockW3[defs[i].fn]();
        if(!res.ok) throw 0;
        setTxRows(p=>p.map((r,j)=>j===i?{...r,status:"done",hash:res.hash}:r));
        await sleep(150);
      }catch{
        setTxRows(p=>p.map((r,j)=>j===i?{...r,status:"error"}:r));
        setTxBusy(false);return;
      }
    }
    setTxBusy(false);setTxDone(true);
    await sleep(900);setTab("dashboard");
  };

  // ── render
  return(
    <div style={{minHeight:"100vh",background:"#04060f",color:"#dde0f0",fontFamily:"'Outfit',sans-serif",overflowX:"hidden"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes popIn{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}
        @keyframes glowPulse{0%,100%{opacity:.08}50%{opacity:.15}}
        @keyframes ticker{from{transform:translateX(0)}to{transform:translateX(-50%)}}
        @keyframes shimmer{from{background-position:-200% center}to{background-position:200% center}}
        .fu{animation:fadeUp .32s ease both}
        .card{background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.065);border-radius:16px;transition:border-color .2s}
        .card:hover{border-color:rgba(255,255,255,.1)}
        .btn{border:none;border-radius:12px;padding:13px 26px;font-size:14px;font-weight:800;cursor:pointer;font-family:inherit;transition:all .18s;letter-spacing:.01em;display:inline-flex;align-items:center;justify-content:center;gap:7px}
        .g{background:#4fffb0;color:#04060f}
        .g:hover{box-shadow:0 0 30px rgba(79,255,176,.4);transform:translateY(-1px)}
        .g:disabled{opacity:.4;cursor:not-allowed;transform:none;box-shadow:none}
        .dk{background:rgba(255,255,255,.05);color:#8090b0}
        .dk:hover{background:rgba(255,255,255,.09);color:#b0bcd0}
        input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:3px;border-radius:2px;outline:none;cursor:pointer;background:#111828}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:15px;height:15px;border-radius:50%;background:#4fffb0;cursor:pointer;box-shadow:0 0 12px rgba(79,255,176,.5);transition:transform .1s}
        input[type=range]::-webkit-slider-thumb:hover{transform:scale(1.35)}
        .xb{background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.065);border-radius:10px;padding:11px 13px;cursor:pointer;transition:all .15s;width:100%;text-align:left;display:flex;align-items:center;gap:9px;font-family:inherit}
        .xb.on{border-color:rgba(79,255,176,.5);background:rgba(79,255,176,.07)}
        .xb:hover:not(.on){background:rgba(255,255,255,.045)}
        .pb{background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.065);border-radius:13px;padding:16px;cursor:pointer;transition:all .18s;width:100%;text-align:left;font-family:inherit}
        .pb.on{background:rgba(79,255,176,.06);border-color:rgba(79,255,176,.4)}
        .pb:hover:not(.on){background:rgba(255,255,255,.04)}
        .ab{background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.065);border-radius:13px;padding:14px;cursor:pointer;transition:all .18s;width:100%;text-align:center;font-family:inherit}
        .ab.on{background:rgba(79,255,176,.07);border-color:rgba(79,255,176,.45)}
        .ab:hover:not(.on){background:rgba(255,255,255,.04)}
        .tbtn{padding:8px 16px;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;border:none;font-family:inherit;transition:all .15s}
        .tbtn.on{background:rgba(255,255,255,.09);color:#dde0f0}
        .tbtn.off{background:none;color:#2a3568}
        .tbtn.off:hover{color:#5a6590}
        .mono{font-family:'JetBrains Mono',monospace}
        .orb{position:absolute;border-radius:50%;filter:blur(110px);pointer-events:none;animation:glowPulse 5s ease-in-out infinite}
        ::-webkit-scrollbar{width:3px;background:#060a14}
        ::-webkit-scrollbar-thumb{background:#1a2035;border-radius:2px}
        .cdd{position:absolute;top:calc(100% + 6px);right:0;background:#090d1b;border:1px solid rgba(255,255,255,.09);border-radius:12px;padding:5px;z-index:100;min-width:165px;animation:popIn .14s ease}
      `}</style>

      {/* Ambient orbs */}
      <div className="orb" style={{left:"3%",top:"8%",width:650,height:650,background:"#4fffb0",opacity:.07}}/>
      <div className="orb" style={{right:"-5%",top:"35%",width:550,height:550,background:"#6366f1",opacity:.07,animationDelay:"2.5s"}}/>
      <div className="orb" style={{left:"38%",bottom:"-5%",width:480,height:480,background:"#0ea5e9",opacity:.06,animationDelay:"1.2s"}}/>

      {/* Ticker bar */}
      <div style={{background:"rgba(255,255,255,.018)",borderBottom:"1px solid rgba(255,255,255,.04)",padding:"5px 0",overflow:"hidden",userSelect:"none"}}>
        <div style={{display:"inline-flex",whiteSpace:"nowrap",animation:"ticker 30s linear infinite"}}>
          {[...Array(2)].map((_,ri)=>(
            <span key={ri} style={{display:"inline-flex",gap:28,alignItems:"center",marginRight:28}}>
              {PROTOCOLS.map(p=><span key={p.id} style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:"#2a3568",display:"inline-flex",gap:6}}><span style={{color:"#4fffb0",fontWeight:700}}>{p.name}</span><span>{rLd?"—":`${rates[p.id]}%`}</span><span style={{color:"#141928"}}>·</span></span>)}
              {ASSETS.map(a=><span key={a.id} style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:"#2a3568",display:"inline-flex",gap:6}}><span style={{color:a.clr,fontWeight:700}}>{a.sym}</span><span>{pLd?"—":`$${fmt(prices[a.id]||0)}`}</span><span style={{color:"#141928"}}>·</span></span>)}
            </span>
          ))}
        </div>
      </div>

      {/* NAV */}
      <nav style={{padding:"15px 26px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:"1px solid rgba(255,255,255,.04)",position:"sticky",top:0,zIndex:50,background:"rgba(4,6,15,.92)",backdropFilter:"blur(18px)"}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          {/* Logo */}
          <div style={{display:"flex",alignItems:"center",gap:9}}>
            <div style={{width:36,height:36,borderRadius:11,background:"linear-gradient(135deg,#4fffb0,#00d4ff)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:900,color:"#04060f"}}>↻</div>
            <span style={{fontSize:20,fontWeight:900,letterSpacing:"-0.04em"}}>RefiFi</span>
            <span style={{fontSize:9,color:"#1e2540",fontWeight:600,letterSpacing:".06em",textTransform:"uppercase",border:"1px solid #1e2540",borderRadius:4,padding:"1px 5px"}}>beta</span>
          </div>
          {/* Tabs */}
          <div style={{display:"flex",gap:2,background:"rgba(255,255,255,.03)",borderRadius:10,padding:3}}>
            {["wizard","dashboard"].map(t=>(
              <button key={t} className={`tbtn ${tab===t?"on":"off"}`} onClick={()=>setTab(t)} style={{textTransform:"capitalize"}}>{t==="wizard"?"⚡ Refinance":"📊 Dashboard"}</button>
            ))}
          </div>
        </div>

        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {/* Live badge */}
          <div style={{display:"flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:100,background:"rgba(79,255,176,.07)",border:"1px solid rgba(79,255,176,.18)"}}>
            <span style={{width:5,height:5,borderRadius:"50%",background:"#4fffb0",display:"inline-block"}}/>
            <span style={{fontSize:9,fontWeight:800,color:"#4fffb0",letterSpacing:".08em",textTransform:"uppercase"}}>{rLd?"Loading…":rates.src+" · Live"}</span>
          </div>

          {/* Chain picker */}
          <div style={{position:"relative"}}>
            <button onClick={()=>setChainDd(!chainDd)} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 11px",background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",borderRadius:10,cursor:"pointer",fontSize:12,fontWeight:700,color:"#b0b8d0",fontFamily:"inherit",gap:6}}>
              <span>{chainI?.icon}</span>{chainI?.short}<span style={{fontSize:8,color:"#2a3568"}}>▼</span>
            </button>
            {chainDd&&(
              <div className="cdd">
                {CHAINS.map(c=>(
                  <button key={c.id} onClick={()=>{setChain(c.id);setChainDd(false);}} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"8px 11px",borderRadius:8,background:chain===c.id?"rgba(79,255,176,.07)":"none",border:"none",cursor:"pointer",fontFamily:"inherit",transition:"background .1s"}}>
                    <span style={{fontSize:13}}>{c.icon}</span>
                    <span style={{fontSize:13,fontWeight:600,color:chain===c.id?"#4fffb0":"#b0b8d0"}}>{c.name}</span>
                    {chain===c.id&&<span style={{marginLeft:"auto",color:"#4fffb0",fontSize:11}}>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Wallet */}
          {wallet?(
            <div style={{display:"flex",alignItems:"center",gap:7,padding:"6px 12px",background:"rgba(79,255,176,.06)",border:"1px solid rgba(79,255,176,.2)",borderRadius:10}}>
              <div style={{width:7,height:7,borderRadius:"50%",background:"#4fffb0"}}/>
              <span className="mono" style={{fontSize:11,color:"#4fffb0",fontWeight:600}}>{wallet.addr.slice(0,6)}…{wallet.addr.slice(-4)}</span>
            </div>
          ):(
            <button className="btn g" style={{padding:"8px 16px",fontSize:12}} onClick={()=>setShowWM(true)}>Connect Wallet</button>
          )}
        </div>
      </nav>

      {/* ═══ DASHBOARD ═══ */}
      {tab==="dashboard"&&(
        <div style={{maxWidth:980,margin:"0 auto",padding:"36px 20px 60px"}} className="fu">
          {!txDone?(
            <div style={{textAlign:"center",padding:"70px 20px"}}>
              <div style={{fontSize:48,marginBottom:16,opacity:.4}}>📊</div>
              <h2 style={{fontSize:22,fontWeight:900,color:"#2a3568",marginBottom:8}}>No active position</h2>
              <p style={{fontSize:14,color:"#1e2540",marginBottom:22}}>Complete a refinance to see your live position dashboard</p>
              <button className="btn g" onClick={()=>setTab("wizard")}>Start Refinancing →</button>
            </div>
          ):(
            <>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24}}>
                <div>
                  <h2 style={{fontSize:26,fontWeight:900,letterSpacing:"-0.03em",marginBottom:4}}>Live Position</h2>
                  <p style={{fontSize:13,color:"#3a4568"}}>{qty} {asset.sym} collateral · {fmtU(debt)} USDC borrowed · {PROTOCOLS.find(p=>p.id===proto)?.name} · {chainI?.name}</p>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button className="btn dk" style={{fontSize:12,padding:"8px 14px"}} onClick={()=>setShowRM(true)}>💸 Off-Ramp</button>
                  <button className="btn g" style={{fontSize:12,padding:"8px 14px"}} onClick={()=>{setStep(0);setTxDone(false);setTxRows([]);setAi(null);setTab("wizard");}}>+ New Position</button>
                </div>
              </div>

              {/* KPI grid */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
                {[
                  {label:"Annual Savings",  val:fmtU(Math.round(savings)), clr:"#4fffb0", icon:"💰", sub:`vs ${crate}% APR`},
                  {label:"Collateral",       val:fmtU(colVal),               clr:"#627EEA", icon:"🏦", sub:`${qty} ${asset.sym}`},
                  {label:"Debt Outstanding", val:fmtU(debt),                 clr:"#ff8080", icon:"💳", sub:`at ${dRate}% APR`},
                  {label:"Health Factor",    val:hf.toFixed(2),              clr:hfClr,     icon:"❤️", sub:hf>2?"Safe":"Watch"},
                ].map((s,i)=>(
                  <div key={i} className="card" style={{padding:18}}>
                    <div style={{fontSize:20,marginBottom:8}}>{s.icon}</div>
                    <div className="mono" style={{fontSize:22,fontWeight:800,color:s.clr,marginBottom:3}}>{s.val}</div>
                    <div style={{fontSize:10,color:"#2a3568",fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",marginBottom:2}}>{s.label}</div>
                    <div style={{fontSize:10,color:"#1e2540"}}>{s.sub}</div>
                  </div>
                ))}
              </div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                {/* Health detail */}
                <div className="card" style={{padding:20}}>
                  <div style={{fontSize:10,fontWeight:800,color:"#2a3568",textTransform:"uppercase",letterSpacing:".08em",marginBottom:14}}>Position Health</div>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:7}}>
                    <span style={{fontSize:13,color:"#5a6590"}}>Health factor</span>
                    <span className="mono" style={{fontSize:20,fontWeight:900,color:hfClr}}>{hf.toFixed(2)}</span>
                  </div>
                  <Bar pct={(hf/4)*100} clr={hfClr} h={6}/>
                  <div style={{display:"flex",justifyContent:"space-between",margin:"5px 0 14px"}}>
                    <span style={{fontSize:8,color:"#1e2540"}}>Liquidation &lt;1.0</span>
                    <span style={{fontSize:8,color:"#1e2540"}}>Safe &gt;2.0</span>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    {[["Liq. Price",fmtU(liqPx),"#ff8080"],["Current Price",fmtU(price),asset.clr],["Drop to Liq.",`${((1-liqPx/price)*100).toFixed(1)}%`,"#f0b429"],["Utilization",`${util.toFixed(1)}%`,"#9098b0"]].map(([l,v,c],i)=>(
                      <div key={i} style={{background:"rgba(255,255,255,.02)",borderRadius:9,padding:"10px 11px"}}>
                        <div style={{fontSize:9,color:"#1e2540",marginBottom:3,textTransform:"uppercase",letterSpacing:".04em"}}>{l}</div>
                        <div className="mono" style={{fontSize:14,fontWeight:700,color:c}}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Savings chart */}
                <div className="card" style={{padding:20}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:4}}>
                    <div style={{fontSize:10,fontWeight:800,color:"#2a3568",textTransform:"uppercase",letterSpacing:".08em"}}>Cumulative Savings</div>
                    <span className="mono" style={{fontSize:12,color:"#4fffb0",fontWeight:700}}>{fmtU(Math.round(savings))}/yr</span>
                  </div>
                  <p style={{fontSize:10,color:"#1e2540",marginBottom:8}}>vs staying at {crate}% APR</p>
                  <MiniChart annual={savings}/>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7,marginTop:10}}>
                    {[{l:"Monthly",v:savings/12},{l:"Yearly",v:savings},{l:"5 Years",v:savings*5}].map((item,i)=>(
                      <div key={i} style={{textAlign:"center",background:"rgba(79,255,176,.04)",borderRadius:8,padding:"8px 4px"}}>
                        <div className="mono" style={{fontSize:12,fontWeight:800,color:"#4fffb0"}}>${fmt(Math.round(item.v))}</div>
                        <div style={{fontSize:8,color:"#1e2540",marginTop:2}}>{item.l}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tx log */}
                <div className="card" style={{padding:20,gridColumn:"1/-1"}}>
                  <div style={{fontSize:10,fontWeight:800,color:"#2a3568",textTransform:"uppercase",letterSpacing:".08em",marginBottom:12}}>Transaction Log</div>
                  {txRows.map((r,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:i<txRows.length-1?"1px solid rgba(255,255,255,.04)":"none"}}>
                      <div style={{width:20,height:20,borderRadius:"50%",background:r.status==="done"?"rgba(79,255,176,.12)":"rgba(255,107,107,.1)",border:`1px solid ${r.status==="done"?"rgba(79,255,176,.3)":"rgba(255,107,107,.3)"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        <span style={{fontSize:10,color:r.status==="done"?"#4fffb0":"#ff8080"}}>{r.status==="done"?"✓":"✗"}</span>
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:12,color:r.status==="done"?"#9098b0":"#ff8080",marginBottom:2}}>{r.label}</div>
                        {r.hash&&<div className="mono" style={{fontSize:9,color:"#1e2540"}}>{r.hash.slice(0,46)}…</div>}
                      </div>
                      {r.status==="done"&&<Tag ch="confirmed" clr="#4fffb0"/>}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══ WIZARD ═══ */}
      {tab==="wizard"&&(
        <div style={{maxWidth:980,margin:"0 auto",padding:"36px 20px 60px"}}>

          {/* Hero */}
          <div style={{textAlign:"center",marginBottom:38}}>
            <div style={{display:"inline-flex",alignItems:"center",gap:6,padding:"4px 13px",borderRadius:100,background:"rgba(79,255,176,.07)",border:"1px solid rgba(79,255,176,.18)",marginBottom:14}}>
              <span style={{width:5,height:5,borderRadius:"50%",background:"#4fffb0",display:"inline-block"}}/>
              <span style={{fontSize:10,fontWeight:800,color:"#4fffb0",letterSpacing:".09em",textTransform:"uppercase"}}>Live · {chainI?.name} · Non-Custodial</span>
            </div>
            <h1 style={{fontSize:"clamp(26px,4.5vw,50px)",fontWeight:900,letterSpacing:"-0.04em",lineHeight:1.08,marginBottom:14}}>
              Escape <span style={{color:"#ff6b6b",textDecoration:"line-through",opacity:.7}}>22%</span> interest.<br/>
              <span style={{background:"linear-gradient(90deg,#4fffb0,#00d4ff)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Borrow at {rLd?"~2.4":dRate}% on-chain.</span>
            </h1>
            <p style={{color:"#2a3568",fontSize:15,maxWidth:400,margin:"0 auto"}}>
              Deposit BTC · ETH · SOL as collateral and refinance your high-interest debt in minutes.
            </p>
          </div>

          {/* Step bar */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",marginBottom:30}}>
            {STEPS.map((label,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center"}}>
                <button onClick={()=>i<=step&&setStep(i)} style={{background:"none",border:"none",cursor:i<=step?"pointer":"default",display:"flex",flexDirection:"column",alignItems:"center",gap:5,opacity:i>step?.22:1,transition:"opacity .3s"}}>
                  <div style={{width:30,height:30,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:900,transition:"all .3s",background:i<step?"#4fffb0":i===step?"rgba(79,255,176,.12)":"rgba(255,255,255,.035)",border:i===step?"2px solid #4fffb0":i<step?"none":"1px solid rgba(255,255,255,.08)",color:i<step?"#04060f":i===step?"#4fffb0":"#1e2540",boxShadow:i===step?"0 0 18px rgba(79,255,176,.25)":"none"}}>{i<step?"✓":i+1}</div>
                  <span style={{fontSize:10,fontWeight:600,color:i===step?"#b0bcd0":"#1e2540",whiteSpace:"nowrap"}}>{label}</span>
                </button>
                {i<STEPS.length-1&&<div style={{width:44,height:1,margin:"0 3px 16px",background:i<step?"#4fffb0":"rgba(255,255,255,.05)",transition:"background .4s"}}/>}
              </div>
            ))}
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 282px",gap:14,alignItems:"start"}}>

            {/* LEFT */}
            <div className="card fu" key={step} style={{padding:28}}>

              {/* ── S0 ── */}
              {step===0&&(<>
                <h2 style={{fontSize:20,fontWeight:900,letterSpacing:"-0.02em",marginBottom:4}}>What are you refinancing?</h2>
                <p style={{fontSize:13,color:"#3a4568",marginBottom:22}}>Select debt type and enter your balance</p>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:22}}>
                  {DEBTS.map(d=>(
                    <button key={d.id} className={`xb${dtype===d.id?" on":""}`} onClick={()=>{setDtype(d.id);setCrate(d.rate);}}>
                      <span style={{fontSize:17}}>{d.icon}</span>
                      <div><div style={{fontSize:13,fontWeight:700,color:dtype===d.id?"#4fffb0":"#b0bcd0"}}>{d.name}</div><div style={{fontSize:10,color:"#1e2540"}}>~{d.rate}% APR</div></div>
                    </button>
                  ))}
                </div>
                {[
                  {label:"Debt Balance",val:debt,min:1000,max:150000,step:500,set:setDebt,fmt:v=>`$${fmt(v)}`,clr:"#dde0f0"},
                  {label:"Your Current APR",val:crate,min:3,max:35,step:.1,set:setCrate,fmt:v=>`${v.toFixed(1)}%`,clr:"#ff8080"},
                ].map(row=>(
                  <div key={row.label} style={{marginBottom:20}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:11}}>
                      <label style={{fontSize:13,color:"#4a5580"}}>{row.label}</label>
                      <span className="mono" style={{fontSize:20,fontWeight:800,color:row.clr}}>{row.fmt(row.val)}</span>
                    </div>
                    <input type="range" min={row.min} max={row.max} step={row.step} value={row.val} onChange={e=>row.set(+e.target.value)}
                      style={{background:`linear-gradient(to right, ${row.clr} ${((row.val-row.min)/(row.max-row.min))*100}%, #111828 0%)`}}/>
                  </div>
                ))}
                <div style={{padding:"14px 16px",background:"rgba(79,255,176,.05)",border:"1px solid rgba(79,255,176,.13)",borderRadius:12,display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:4}}>
                  <div><div style={{fontSize:10,color:"#2a3568",marginBottom:2,textTransform:"uppercase",letterSpacing:".06em"}}>Projected Annual Savings</div><div className="mono" style={{fontSize:24,fontWeight:900,color:"#4fffb0"}}>{fmtU(Math.round(savings))}</div></div>
                  <div style={{textAlign:"right"}}><div style={{fontSize:11,color:"#2a3568",marginBottom:2}}>{crate}% → {rLd?"…":dRate}%</div><div style={{fontSize:10,color:"#1a2035"}}>on {fmtU(debt)}</div></div>
                </div>
              </>)}

              {/* ── S1 ── */}
              {step===1&&(<>
                <h2 style={{fontSize:20,fontWeight:900,letterSpacing:"-0.02em",marginBottom:4}}>Choose collateral</h2>
                <p style={{fontSize:13,color:"#3a4568",marginBottom:22}}>Your crypto backs the loan — you keep 100% of the upside</p>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:22}}>
                  {ASSETS.map(a=>(
                    <button key={a.id} className={`ab${aid===a.id?" on":""}`} onClick={()=>setAid(a.id)}>
                      <div style={{fontSize:26,color:a.clr,marginBottom:5}}>{a.icon}</div>
                      <div style={{fontSize:14,fontWeight:800,marginBottom:3}}>{a.sym}</div>
                      <div className="mono" style={{fontSize:11,color:"#4a5580",marginBottom:5}}>{pLd?"…":`$${fmt(prices[a.id]||0)}`}</div>
                      <Tag ch={`LTV ${(a.ltv*100).toFixed(0)}%`} clr={a.clr}/>
                    </button>
                  ))}
                </div>
                <div style={{marginBottom:20}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:11}}>
                    <label style={{fontSize:13,color:"#4a5580"}}>Amount of {asset.sym}</label>
                    <span className="mono" style={{fontSize:20,fontWeight:800,color:asset.clr}}>{qty} {asset.sym}</span>
                  </div>
                  <input type="range" min={.1} max={aid==="wbtc"?5:aid==="sol"?500:50} step={.1} value={qty} onChange={e=>setQty(+e.target.value)}
                    style={{background:`linear-gradient(to right, ${asset.clr} ${((qty-.1)/((aid==="wbtc"?5:aid==="sol"?500:50)-.1))*100}%, #111828 0%)`}}/>
                </div>
                <div style={{marginBottom:14}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                    <span style={{fontSize:12,color:"#4a5580"}}>Utilization</span>
                    <span className="mono" style={{fontSize:12,fontWeight:700,color:util>80?"#ff8080":util>60?"#f0b429":"#4fffb0"}}>{util.toFixed(1)}%</span>
                  </div>
                  <Bar pct={util} clr={util>80?"#ff8080":util>60?"#f0b429":"#4fffb0"} h={5}/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
                  {[["Collateral Value",fmtU(colVal),"#c0c8e0"],["Max Borrow",fmtU(maxB),"#4fffb0"],["Your Debt",fmtU(debt),canCov?"#c0c8e0":"#ff8080"],["Buffer",fmtU(Math.max(0,maxB-debt)),"#4fffb0"]].map(([l,v,c],i)=>(
                    <div key={i} style={{background:"rgba(255,255,255,.02)",borderRadius:10,padding:"11px 13px"}}>
                      <div style={{fontSize:9,color:"#1a2035",textTransform:"uppercase",letterSpacing:".05em",marginBottom:3}}>{l}</div>
                      <div className="mono" style={{fontSize:15,fontWeight:800,color:c}}>{v}</div>
                    </div>
                  ))}
                </div>
                {!canCov&&<div style={{marginTop:12,padding:"9px 13px",background:"rgba(255,107,107,.06)",border:"1px solid rgba(255,107,107,.18)",borderRadius:9,fontSize:12,color:"#ff8080"}}>⚠ Need {fmtU(debt-maxB)} more borrowing capacity — add more {asset.sym}</div>}
              </>)}

              {/* ── S2 ── */}
              {step===2&&(<>
                <h2 style={{fontSize:20,fontWeight:900,letterSpacing:"-0.02em",marginBottom:4}}>Select protocol</h2>
                <p style={{fontSize:13,color:"#3a4568",marginBottom:22}}>All audited, non-custodial — rates live from DefiLlama</p>
                <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
                  {PROTOCOLS.map(p=>(
                    <button key={p.id} className={`pb${proto===p.id?" on":""}`} onClick={()=>setProto(p.id)}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                        <div style={{display:"flex",alignItems:"center",gap:9}}>
                          <span style={{fontSize:20}}>{p.icon}</span>
                          <span style={{fontSize:15,fontWeight:800,color:proto===p.id?"#4fffb0":"#c0c8d8"}}>{p.name}</span>
                          <Tag ch={p.badge} clr={p.badgeClr}/>
                        </div>
                        <div style={{textAlign:"right"}}>
                          {rLd?<Spin sz={14}/>:<span className="mono" style={{fontSize:22,fontWeight:900,color:"#4fffb0"}}>{rates[p.id]}%</span>}
                          <div style={{fontSize:9,color:"#1e2540"}}>USDC APR</div>
                        </div>
                      </div>
                      <div style={{fontSize:11,color:"#3a4568",marginBottom:6}}>TVL {p.tvl} · {chainI?.name} · Audited by PeckShield</div>
                      <Bar pct={(1-(rates[p.id]||p.fb)/5)*100} clr="#4fffb0" h={2}/>
                    </button>
                  ))}
                </div>
                <div style={{padding:"10px 13px",background:"rgba(99,102,241,.05)",borderRadius:10,border:"1px solid rgba(99,102,241,.11)",fontSize:11,color:"#4a5580",lineHeight:1.65}}>
                  💡 Auto-refreshes every 60s from <span style={{color:"#818cf8",fontWeight:700}}>DefiLlama API</span>. Morpho is currently {rates.aave>rates.morpho?`${(rates.aave-rates.morpho).toFixed(2)}% cheaper than Aave V3`:"at a similar rate to Aave"}.
                </div>
              </>)}

              {/* ── S3 ── */}
              {step===3&&(<>
                <h2 style={{fontSize:20,fontWeight:900,letterSpacing:"-0.02em",marginBottom:4}}>Review & Execute</h2>
                <p style={{fontSize:13,color:"#3a4568",marginBottom:18}}>4 transactions · Fully automated · Non-custodial</p>

                <div style={{textAlign:"center",padding:"20px",background:"linear-gradient(135deg,rgba(79,255,176,.07),rgba(0,212,255,.04))",border:"1px solid rgba(79,255,176,.14)",borderRadius:14,marginBottom:16}}>
                  <div style={{fontSize:9,color:"#2a3568",textTransform:"uppercase",letterSpacing:".1em",marginBottom:4}}>Annual savings</div>
                  <div className="mono" style={{fontSize:42,fontWeight:900,color:"#4fffb0",lineHeight:1}}>{fmtU(Math.round(aSav))}</div>
                  <div style={{fontSize:11,color:"#1e2540",marginTop:4}}>{crate}% → {dRate}% · {fmtU(Math.round(aSav/12))}/month saved</div>
                </div>

                <div className="card" style={{padding:14,marginBottom:12}}>
                  <div style={{fontSize:9,fontWeight:800,color:"#1e2540",textTransform:"uppercase",letterSpacing:".07em",marginBottom:10}}>Order</div>
                  {[["Collateral",`${qty} ${asset.sym} (${fmtU(colVal)})`],["Protocol",PROTOCOLS.find(p=>p.id===proto)?.name],["Borrow",`${fmtU(debt)} USDC`],["APR",`${dRate}%`],["Network",chainI?.name],["Health Factor",`${hf.toFixed(2)}`]].map(([l,v],i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:i<5?"1px solid rgba(255,255,255,.04)":"none"}}>
                      <span style={{fontSize:12,color:"#2a3568"}}>{l}</span>
                      <span className="mono" style={{fontSize:12,color:"#8090a0",fontWeight:600}}>{v}</span>
                    </div>
                  ))}
                </div>

                {txRows.length>0&&(
                  <div className="card" style={{padding:14,marginBottom:12}}>
                    <div style={{fontSize:9,fontWeight:800,color:"#1e2540",textTransform:"uppercase",letterSpacing:".07em",marginBottom:8}}>Transactions</div>
                    {txRows.map((r,i)=>(
                      <div key={i} style={{display:"flex",alignItems:"center",gap:9,padding:"8px 0",borderBottom:i<txRows.length-1?"1px solid rgba(255,255,255,.04)":"none"}}>
                        <div style={{width:20,height:20,borderRadius:"50%",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",background:r.status==="done"?"rgba(79,255,176,.1)":r.status==="loading"?"rgba(240,180,41,.1)":r.status==="error"?"rgba(255,107,107,.1)":"rgba(30,36,64,.5)",border:`1px solid ${r.status==="done"?"rgba(79,255,176,.3)":r.status==="loading"?"rgba(240,180,41,.3)":r.status==="error"?"rgba(255,107,107,.3)":"rgba(30,36,64,.5)"}`}}>
                          {r.status==="done"?<span style={{fontSize:9,color:"#4fffb0"}}>✓</span>:r.status==="loading"?<Spin sz={9} clr="#f0b429"/>:r.status==="error"?<span style={{fontSize:9,color:"#ff8080"}}>✗</span>:<span style={{width:4,height:4,borderRadius:"50%",background:"#1e2540",display:"block"}}/>}
                        </div>
                        <div style={{flex:1}}>
                          <div style={{fontSize:12,color:r.status==="done"?"#6070a0":r.status==="loading"?"#f0b429":r.status==="error"?"#ff8080":"#1e2540"}}>{r.label}</div>
                          {r.hash&&<div className="mono" style={{fontSize:9,color:"#1a2035",marginTop:2}}>{r.hash.slice(0,44)}…</div>}
                        </div>
                        {r.status==="done"&&<Tag ch="done" clr="#4fffb0"/>}
                      </div>
                    ))}
                  </div>
                )}

                <div style={{marginBottom:14}}><AIPanel data={ai} loading={aiLd}/></div>

                {txDone?(
                  <div style={{padding:18,background:"rgba(79,255,176,.06)",border:"1px solid rgba(79,255,176,.18)",borderRadius:13,textAlign:"center"}}>
                    <div style={{fontSize:28,marginBottom:7}}>🎉</div>
                    <div style={{fontSize:17,fontWeight:900,color:"#4fffb0",marginBottom:4}}>Refinance Complete!</div>
                    <div style={{fontSize:12,color:"#4a5580",marginBottom:14}}>Saving {fmtU(Math.round(savings))}/yr · Borrowing at {dRate}% APR</div>
                    <div style={{display:"flex",gap:9,justifyContent:"center"}}>
                      <button className="btn g" style={{fontSize:13,padding:"10px 18px"}} onClick={()=>setTab("dashboard")}>View Dashboard →</button>
                      <button className="btn dk" style={{fontSize:13,padding:"10px 18px"}} onClick={()=>setShowRM(true)}>Off-Ramp USDC</button>
                    </div>
                  </div>
                ):(
                  <div style={{display:"flex",gap:9}}>
                    {!wallet&&<button className="btn g" style={{flex:1}} onClick={()=>setShowWM(true)}>Connect Wallet to Execute</button>}
                    {wallet&&!txBusy&&<button className="btn g" style={{flex:1}} onClick={runTx}>⚡ Execute Refinance — {fmtU(debt)}</button>}
                    {wallet&&txBusy&&<button className="btn g" style={{flex:1}} disabled><Spin sz={13} clr="#04060f"/> Processing…</button>}
                    <button className="btn dk" style={{padding:"13px 14px",fontSize:13}} title="Off-ramp" onClick={()=>setShowRM(true)}>💸</button>
                  </div>
                )}
              </>)}

              {/* Nav */}
              <div style={{display:"flex",justifyContent:"space-between",marginTop:24}}>
                {step>0?<button className="btn dk" onClick={()=>setStep(s=>s-1)}>← Back</button>:<div/>}
                {step<3&&<button className="btn g" onClick={()=>setStep(s=>s+1)}>Continue →</button>}
              </div>
            </div>

            {/* RIGHT sidebar */}
            <div style={{display:"flex",flexDirection:"column",gap:12}}>

              <div className="card" style={{padding:16}}>
                <div style={{fontSize:9,fontWeight:800,color:"#1e2540",textTransform:"uppercase",letterSpacing:".09em",marginBottom:13}}>Rate Arbitrage</div>
                {[{l:"Your rate",v:`${crate.toFixed(1)}%`,pct:(crate/35)*100,clr:"#ff8080"},{l:`DeFi (${proto})`,v:rLd?"…":`${dRate}%`,pct:(dRate/35)*100,clr:"#4fffb0"}].map((row,i)=>(
                  <div key={i} style={{marginBottom:i===0?12:0}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                      <span style={{fontSize:11,color:"#4a5580"}}>{row.l}</span>
                      <span className="mono" style={{fontSize:13,color:row.clr,fontWeight:800}}>{row.v}</span>
                    </div>
                    <Bar pct={row.pct} clr={row.clr} h={4}/>
                  </div>
                ))}
                <div style={{marginTop:12,padding:"9px 11px",background:"rgba(79,255,176,.05)",borderRadius:9,textAlign:"center"}}>
                  <div style={{fontSize:8,color:"#1e2540",marginBottom:1}}>SAVING</div>
                  <div className="mono" style={{fontSize:22,fontWeight:900,color:"#4fffb0"}}>{(crate-dRate).toFixed(2)}%</div>
                  <div style={{fontSize:8,color:"#1e2540"}}>per year</div>
                </div>
              </div>

              <div className="card" style={{padding:16}}>
                <div style={{fontSize:9,fontWeight:800,color:"#1e2540",textTransform:"uppercase",letterSpacing:".09em",marginBottom:11}}>Savings</div>
                {[{l:"Monthly",v:aSav/12},{l:"Yearly",v:aSav},{l:"5-Year",v:aSav*5}].map((row,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:i<2?"1px solid rgba(255,255,255,.04)":"none"}}>
                    <span style={{fontSize:11,color:"#3a4568"}}>{row.l}</span>
                    <span className="mono" style={{fontSize:12,color:"#b0bcd0",fontWeight:700}}>${fmt(Math.round(row.v))}</span>
                  </div>
                ))}
              </div>

              <div className="card" style={{padding:16}}>
                <div style={{fontSize:9,fontWeight:800,color:"#1e2540",textTransform:"uppercase",letterSpacing:".09em",marginBottom:11}}>Collateral Health</div>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                  <span style={{fontSize:11,color:"#4a5580"}}>Health factor</span>
                  <span className="mono" style={{fontSize:16,fontWeight:900,color:hfClr}}>{isFinite(aHF)?aHF.toFixed(2):"∞"}</span>
                </div>
                <Bar pct={Math.min((hf/4)*100,100)} clr={hfClr} h={5}/>
                <div style={{display:"flex",justifyContent:"space-between",margin:"4px 0 10px"}}>
                  <span style={{fontSize:7,color:"#1a2035"}}>Liq &lt;1.0</span>
                  <span style={{fontSize:7,color:"#1a2035"}}>Safe &gt;2.0</span>
                </div>
                <div style={{fontSize:10,color:"#1e2540",lineHeight:1.7}}>
                  Liq: <span className="mono" style={{color:"#ff8080"}}>{isFinite(liqPx)?`$${fmt(liqPx,0)}`:"—"}</span>
                  {" "}· Current: <span className="mono" style={{color:asset.clr}}>${fmt(price)}</span>
                </div>
              </div>

              <div className="card" style={{padding:16}}>
                <div style={{fontSize:9,fontWeight:800,color:"#1e2540",textTransform:"uppercase",letterSpacing:".09em",marginBottom:11}}>Live Rates</div>
                {PROTOCOLS.map((p,i)=>(
                  <div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:i<2?"1px solid rgba(255,255,255,.04)":"none"}}>
                    <span style={{fontSize:10,color:proto===p.id?"#4fffb0":"#3a4568",display:"flex",alignItems:"center",gap:5}}><span>{p.icon}</span>{p.name}</span>
                    <span className="mono" style={{fontSize:12,fontWeight:700,color:proto===p.id?"#4fffb0":"#4a5580"}}>{rLd?"…":`${rates[p.id]}%`}</span>
                  </div>
                ))}
                <div style={{fontSize:8,color:"#141928",marginTop:7}}>via {rates.src} · 60s refresh</div>
              </div>

            </div>
          </div>

          <div style={{marginTop:32,paddingTop:16,borderTop:"1px solid rgba(255,255,255,.035)",textAlign:"center"}}>
            <p style={{fontSize:10,color:"#141928",maxWidth:560,margin:"0 auto",lineHeight:1.8}}>Non-custodial · Your keys, your funds · Not financial advice · DeFi involves liquidation risk · Rates from DefiLlama · Prices from CoinGecko</p>
          </div>
        </div>
      )}

      {showWM&&<WalletModal onConnect={w=>{setWallet(w);setShowWM(false);}} onClose={()=>setShowWM(false)}/>}
      {showRM&&<RampModal amount={debt} onClose={()=>setShowRM(false)}/>}
    </div>
  );
}
