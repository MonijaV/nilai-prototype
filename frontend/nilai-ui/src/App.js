import React, { useState, useEffect, useRef } from "react";
import axios from "axios";

const API_URL = "https://u9be2ohiyg.execute-api.ap-south-1.amazonaws.com/prod/search";

const CAT_COLOR = {
  agriculture:"#22c55e",education:"#3b82f6",health:"#ef4444",
  housing:"#f59e0b",finance:"#a855f7",employment:"#06b6d4",
  insurance:"#ec4899",women:"#f97316","social welfare":"#6366f1"
};
const CAT_ICON = {
  agriculture:"🌾",education:"📚",health:"🏥",housing:"🏠",
  finance:"💰",employment:"💼",insurance:"🛡️",women:"👩","social welfare":"🤝"
};

let _mid = 0;
const uid = () => ++_mid;

const QUICK_PROMPTS = [
  "I need money for education 📚",
  "I am a farmer 🌾",
  "Looking for job support 💼",
  "Health insurance schemes 🏥",
  "I am a woman entrepreneur 👩",
  "Housing support schemes 🏠",
];

function Dots() {
  return (
    <div style={{display:"flex",gap:"6px",padding:"16px 22px",background:"rgba(255,255,255,0.95)",borderRadius:"22px",boxShadow:"0 4px 20px rgba(0,0,0,0.08)",backdropFilter:"blur(8px)"}}>
      {[0,1,2].map(i=>(
        <div key={i} style={{width:"8px",height:"8px",borderRadius:"50%",background:"#6366f1",animation:`nb 1.2s ${i*0.2}s infinite`}}/>
      ))}
    </div>
  );
}

function Avatar({ size=42 }) {
  return (
    <div style={{
      width:size+"px",height:size+"px",borderRadius:"50%",flexShrink:0,
      background:"linear-gradient(135deg,#6366f1,#8b5cf6,#a855f7)",
      display:"flex",alignItems:"center",justifyContent:"center",
      fontSize:(size*0.45)+"px",
      boxShadow:"0 4px 16px rgba(99,102,241,0.45)",
    }}>🤖</div>
  );
}

function WelcomeCard({ onQuickPrompt }) {
  return (
    <div style={{marginBottom:"24px",animation:"su 0.5s both"}}>
      <div style={{
        background:"linear-gradient(135deg,#6366f1 0%,#8b5cf6 50%,#a855f7 100%)",
        borderRadius:"28px",padding:"28px",marginBottom:"16px",
        boxShadow:"0 16px 50px rgba(99,102,241,0.4)",
        position:"relative",overflow:"hidden",
      }}>
        <div style={{position:"absolute",top:"-30px",right:"-30px",width:"140px",height:"140px",borderRadius:"50%",background:"rgba(255,255,255,0.06)"}}/>
        <div style={{position:"absolute",bottom:"-20px",left:"-20px",width:"100px",height:"100px",borderRadius:"50%",background:"rgba(255,255,255,0.04)"}}/>
        <div style={{position:"relative"}}>
          <div style={{fontSize:"32px",marginBottom:"10px"}}>🏛️</div>
          <h2 style={{fontSize:"24px",fontWeight:"800",color:"#fff",marginBottom:"8px",letterSpacing:"-0.5px"}}>Welcome to NILAI</h2>
          <p style={{fontSize:"14px",color:"rgba(255,255,255,0.85)",lineHeight:"1.6",marginBottom:"18px"}}>
            Your personal AI advisor for discovering government schemes you qualify for — completely free. Just chat naturally with me!
          </p>
          <div style={{display:"flex",flexWrap:"wrap",gap:"8px"}}>
            {["✅verified schemes","✅ Tamil Nadu + National","✅ AI-powered matching","✅ Free & confidential"].map((t,i)=>(
              <span key={i} style={{background:"rgba(255,255,255,0.15)",borderRadius:"20px",padding:"5px 14px",fontSize:"12px",color:"#fff",fontWeight:"500"}}>{t}</span>
            ))}
          </div>
        </div>
      </div>

      <div style={{display:"flex",justifyContent:"center",gap:"20px",marginBottom:"16px",flexWrap:"wrap"}}>
        {[["🔒","Secure & Private"],["🏛️","Official Gov Data"],["⚡","AI Powered"],["🆓","100% Free"]].map(([ic,lb],i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:"5px",fontSize:"12px",color:"#64748b",fontWeight:"500"}}>
            <span>{ic}</span><span>{lb}</span>
          </div>
        ))}
      </div>

      <div style={{background:"rgba(255,255,255,0.85)",borderRadius:"20px",padding:"16px",boxShadow:"0 2px 16px rgba(0,0,0,0.06)",backdropFilter:"blur(8px)"}}>
        <div style={{fontSize:"12px",fontWeight:"700",color:"#94a3b8",letterSpacing:"0.5px",marginBottom:"10px"}}>✨ QUICK START — TAP TO BEGIN</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:"8px"}}>
          {QUICK_PROMPTS.map((q,i)=>(
            <button key={i} onClick={()=>onQuickPrompt(q)} style={{
              background:"#eef2ff",border:"1px solid #e0e7ff",borderRadius:"20px",
              padding:"8px 16px",fontSize:"13px",color:"#4f46e5",fontWeight:"600",
              cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s",
            }}
              onMouseEnter={e=>{e.target.style.background="#4f46e5";e.target.style.color="#fff";}}
              onMouseLeave={e=>{e.target.style.background="#eef2ff";e.target.style.color="#4f46e5";}}
            >{q}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SchemeCard({ s, idx }) {
  const [open, setOpen] = useState(false);
  const c = CAT_COLOR[s.category] || "#6366f1";
  const ic = CAT_ICON[s.category] || "📋";
  return (
    <div style={{
      background:"rgba(255,255,255,0.95)",backdropFilter:"blur(8px)",
      borderRadius:"22px",overflow:"visible",marginBottom:"14px",position:"relative",
      boxShadow:`0 4px 24px rgba(0,0,0,0.07), 0 0 0 1px ${c}18`,
      animation:`su 0.4s ${idx*0.1}s both`,transition:"transform 0.25s, box-shadow 0.25s",
    }}
      onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow=`0 12px 40px rgba(0,0,0,0.1), 0 0 0 1px ${c}30`;}}
      onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow=`0 4px 24px rgba(0,0,0,0.07), 0 0 0 1px ${c}18`;}}
    >
      <div style={{position:"absolute",top:"-10px",right:"16px",background:`linear-gradient(135deg,${c},${c}cc)`,color:"#fff",fontSize:"11px",fontWeight:"800",padding:"4px 12px",borderRadius:"12px",boxShadow:`0 4px 12px ${c}50`,zIndex:2}}>#{idx+1} Match</div>
      <div style={{height:"4px",background:`linear-gradient(90deg,${c},${c}66,transparent)`,borderRadius:"22px 22px 0 0"}}/>
      <div style={{padding:"18px"}}>
        <div style={{display:"flex",gap:"12px",alignItems:"flex-start",marginBottom:"14px"}}>
          <div style={{width:"50px",height:"50px",borderRadius:"16px",background:`${c}15`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"26px",flexShrink:0}}>{ic}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:"15px",fontWeight:"700",color:"#0f172a",lineHeight:"1.3",marginBottom:"7px"}}>{s.name}</div>
            <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
              <span style={{background:`${c}15`,color:c,padding:"3px 10px",borderRadius:"20px",fontSize:"11px",fontWeight:"700",textTransform:"capitalize"}}>{s.category}</span>
              <span style={{background:"#f1f5f9",color:"#64748b",padding:"3px 10px",borderRadius:"20px",fontSize:"11px"}}>{s.state==="ALL"?"🇮🇳 National":`📍 ${s.state}`}</span>
            </div>
          </div>
          <div style={{background:`linear-gradient(135deg,${c},${c}cc)`,borderRadius:"14px",padding:"7px 14px",fontSize:"15px",fontWeight:"800",color:"#fff",flexShrink:0,boxShadow:`0 4px 12px ${c}40`,textAlign:"center"}}>
            {s.relevanceScore}%
            <div style={{fontSize:"9px",fontWeight:"600",opacity:0.85,marginTop:"1px"}}>AI MATCH</div>
          </div>
        </div>

        <div style={{marginBottom:"14px"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:"5px"}}>
            <span style={{fontSize:"10px",fontWeight:"700",color:"#94a3b8",letterSpacing:"0.5px"}}>AI CONFIDENCE</span>
            <span style={{fontSize:"10px",fontWeight:"700",color:c}}>{s.relevanceScore}%</span>
          </div>
          <div style={{height:"6px",background:"#f1f5f9",borderRadius:"10px",overflow:"hidden"}}>
            <div style={{height:"100%",width:`${s.relevanceScore}%`,background:`linear-gradient(90deg,${c},${c}aa)`,borderRadius:"10px",transition:"width 1.2s ease"}}/>
          </div>
        </div>

        <div style={{display:"flex",alignItems:"center",background:`linear-gradient(135deg,${c}12,${c}06)`,border:`1px solid ${c}22`,borderRadius:"14px",padding:"10px 16px",marginBottom:"14px"}}>
          <span style={{fontSize:"11px",fontWeight:"800",color:c,letterSpacing:"0.5px"}}>💎 BENEFIT</span>
          <span style={{fontSize:"14px",fontWeight:"800",color:"#0f172a",marginLeft:"auto"}}>{s.benefitAmount}</span>
        </div>

        <div style={{background:`${c}08`,border:`1px solid ${c}20`,borderRadius:"16px",padding:"14px",marginBottom:"14px"}}>
          <div style={{fontSize:"11px",fontWeight:"800",color:c,letterSpacing:"0.6px",marginBottom:"7px"}}>✓ WHY YOU QUALIFY</div>
          <div style={{fontSize:"13px",color:"#374151",lineHeight:"1.7"}}>{s.whyItMatches}</div>
        </div>

        {open && (
          <div style={{borderTop:"1px solid #f1f5f9",paddingTop:"14px",marginBottom:"14px",animation:"su 0.3s both"}}>
            <p style={{fontSize:"13px",color:"#6b7280",lineHeight:"1.7",marginBottom:"14px"}}>{s.description}</p>
            {s.documents?.length > 0 && (
              <div style={{marginBottom:"14px"}}>
                <div style={{fontSize:"11px",fontWeight:"700",color:"#9ca3af",letterSpacing:"0.5px",marginBottom:"8px"}}>DOCUMENTS NEEDED</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:"6px"}}>
                  {s.documents.map((d,i)=><span key={i} style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:"8px",padding:"4px 12px",fontSize:"12px",color:"#64748b"}}>📄 {d}</span>)}
                </div>
              </div>
            )}
            {s.applicationProcess && (
              <div>
                <div style={{fontSize:"11px",fontWeight:"700",color:"#9ca3af",letterSpacing:"0.5px",marginBottom:"6px"}}>HOW TO APPLY</div>
                <p style={{fontSize:"13px",color:"#6b7280",lineHeight:"1.6"}}>📌 {s.applicationProcess}</p>
              </div>
            )}
          </div>
        )}
        <div style={{display:"flex",gap:"10px"}}>
          <a href={s.officialLink} target="_blank" rel="noopener noreferrer"
            style={{flex:1,padding:"12px",borderRadius:"14px",textAlign:"center",background:`linear-gradient(135deg,${c},${c}dd)`,color:"#fff",textDecoration:"none",fontSize:"13px",fontWeight:"700",boxShadow:`0 4px 16px ${c}35`}}>
            Apply Now ↗
          </a>
          <button onClick={()=>setOpen(!open)}
            style={{padding:"12px 20px",borderRadius:"14px",background:"#f8fafc",border:"1px solid #e2e8f0",color:"#64748b",fontSize:"13px",fontWeight:"600",cursor:"pointer",fontFamily:"inherit"}}>
            {open?"Less ▲":"Details ▼"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BotMsg({ msg, onOption }) {
  if (msg.type === "schemes") return (
    <div style={{display:"flex",gap:"12px",marginBottom:"20px",animation:"su 0.4s both"}}>
      <Avatar/>
      <div style={{flex:1,minWidth:0}}>
        {msg.transitionMessage && (
          <div style={{background:"rgba(255,255,255,0.95)",borderRadius:"22px",padding:"14px 20px",marginBottom:"12px",boxShadow:"0 2px 16px rgba(0,0,0,0.06)",fontSize:"15px",color:"#1e293b",lineHeight:"1.8"}}>{msg.transitionMessage}</div>
        )}
        <div style={{background:"rgba(255,255,255,0.95)",backdropFilter:"blur(8px)",borderRadius:"22px",padding:"18px 22px",marginBottom:"16px",boxShadow:"0 4px 24px rgba(0,0,0,0.07)"}}>
          <div style={{display:"inline-flex",alignItems:"center",gap:"6px",background:"linear-gradient(135deg,#6366f1,#8b5cf6)",borderRadius:"20px",padding:"5px 14px",marginBottom:"12px"}}>
            <span style={{fontSize:"10px",fontWeight:"800",color:"#fff",letterSpacing:"0.8px"}}>⚡ BEDROCK AI · {msg.count} SCHEMES ANALYZED</span>
          </div>
          <div style={{fontSize:"15px",color:"#1e293b",lineHeight:"1.8"}}>{msg.understanding}</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"16px"}}>
          <div style={{height:"1px",flex:1,background:"linear-gradient(90deg,#e2e8f0,transparent)"}}/>
          <span style={{fontSize:"11px",fontWeight:"800",color:"#94a3b8",whiteSpace:"nowrap",background:"#fff",padding:"4px 12px",borderRadius:"20px",border:"1px solid #e2e8f0"}}>🎯 TOP SCHEMES FOR YOU</span>
          <div style={{height:"1px",flex:1,background:"linear-gradient(270deg,#e2e8f0,transparent)"}}/>
        </div>
        {msg.schemes.map((s,i)=><SchemeCard key={s.schemeId||i} s={s} idx={i}/>)}
        <div style={{background:"linear-gradient(135deg,#f0f4ff,#faf5ff)",border:"1px solid #e0e7ff",borderRadius:"22px",padding:"16px 20px",marginTop:"4px"}}>
          <div style={{fontSize:"13px",color:"#4f46e5",lineHeight:"1.85",whiteSpace:"pre-wrap",fontWeight:"500"}}>{msg.followUp}</div>
        </div>
      </div>
    </div>
  );

  if (msg.type === "explain") return (
    <div style={{display:"flex",gap:"12px",marginBottom:"16px",animation:"su 0.4s both"}}>
      <Avatar/>
      <div style={{background:"rgba(255,255,255,0.95)",backdropFilter:"blur(8px)",borderRadius:"22px",padding:"20px 22px",maxWidth:"88%",boxShadow:"0 4px 24px rgba(0,0,0,0.07)",border:"1px solid rgba(245,158,11,0.2)"}}>
        <div style={{display:"inline-flex",alignItems:"center",gap:"6px",background:"linear-gradient(135deg,#f59e0b,#f97316)",borderRadius:"20px",padding:"5px 14px",marginBottom:"12px"}}>
          <span style={{fontSize:"10px",fontWeight:"800",color:"#fff",letterSpacing:"0.8px"}}>💡 NILAI EXPLAINS</span>
        </div>
        <div style={{fontSize:"13px",color:"#7c3aed",fontWeight:"600",marginBottom:"12px",paddingBottom:"12px",borderBottom:"1px solid #f3f4f6"}}>{msg.understanding}</div>
        <div style={{fontSize:"14px",color:"#1e293b",lineHeight:"1.9",whiteSpace:"pre-wrap"}}>{msg.explanation}</div>
      </div>
    </div>
  );

  if (msg.type === "error") return (
    <div style={{display:"flex",gap:"12px",marginBottom:"14px",animation:"su 0.3s both"}}>
      <div style={{width:"42px",height:"42px",borderRadius:"50%",background:"#fee2e2",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"18px",flexShrink:0}}>⚠️</div>
      <div style={{background:"#fff5f5",border:"1px solid #fecaca",borderRadius:"22px",padding:"14px 20px",fontSize:"14px",color:"#dc2626",lineHeight:"1.6"}}>{msg.content}</div>
    </div>
  );

  return (
    <div style={{display:"flex",gap:"12px",marginBottom:"16px",animation:"su 0.3s both"}}>
      <Avatar/>
      <div style={{maxWidth:"82%"}}>
        <div style={{background:"rgba(255,255,255,0.95)",backdropFilter:"blur(8px)",borderRadius:"22px",padding:"16px 22px",boxShadow:"0 4px 20px rgba(0,0,0,0.07)",marginBottom:msg.options?.length?"12px":"0"}}>
          <div style={{fontSize:"15px",color:"#1e293b",lineHeight:"1.8",whiteSpace:"pre-wrap"}}>{msg.content}</div>
        </div>
        {msg.options?.length > 0 && (
          <div style={{display:"flex",flexWrap:"wrap",gap:"8px"}}>
            {msg.options.map((o,i)=>(
              <button key={i} onClick={()=>onOption(o)} style={{
                background:"rgba(255,255,255,0.95)",border:"2px solid #e0e7ff",borderRadius:"20px",
                padding:"9px 20px",color:"#4f46e5",fontSize:"13px",fontWeight:"600",
                cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s",
                boxShadow:"0 2px 8px rgba(99,102,241,0.1)",
              }}
                onMouseEnter={e=>{e.target.style.background="#4f46e5";e.target.style.color="#fff";e.target.style.borderColor="#4f46e5";}}
                onMouseLeave={e=>{e.target.style.background="rgba(255,255,255,0.95)";e.target.style.color="#4f46e5";e.target.style.borderColor="#e0e7ff";}}
              >{o}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState({});
  const [lastResults, setLastResults] = useState([]);
  const [activeSchemeId, setActiveSchemeId] = useState(null);
  const [phase, setPhase] = useState("collect");
  const [conversationHistory, setConversationHistory] = useState([]);
  const [showWelcome, setShowWelcome] = useState(true);
  const bottomRef = useRef(null);
  const initialized = useRef(false);

  const push = m => setMsgs(p => [...p, { id: uid(), ...m }]);
  const botSay = (content, extra={}) => push({ role:"bot", type:"chat", content, ...extra });

  // Add to conversation history
  const addToHistory = (role, content) => {
    setConversationHistory(prev => [...prev.slice(-12), { role, content }]);
  };

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    // No initial message — welcome card handles it
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  async function sendMessage(text) {
    setBusy(true);
    addToHistory("user", text);

    try {
      const res = await axios.post(API_URL, {
        query: text,
        userProfile: profile,
        previousSchemes: lastResults,
        activeSchemeId,
        conversationHistory: conversationHistory.slice(-10),
        phase,
      });

      setBusy(false);
      const d = res.data;

      // Update profile with newly extracted info
      if (d.updatedProfile) {
        setProfile(d.updatedProfile);
      }

      // Update phase
      if (d.phase) setPhase(d.phase);

      // Handle different response types
      if (d.intent === "search" && d.matches?.length > 0) {
        setLastResults(d.matches);
        setPhase("results");
        push({
          role:"bot", type:"schemes",
          understanding: d.understanding,
          schemes: d.matches,
          count: d.totalSchemesAnalyzed,
          transitionMessage: d.transitionMessage,
          followUp: "Have questions? Try asking:\n• \"Explain the first scheme to me\"\n• \"What documents do I need for the second scheme?\"\n• \"Am I eligible for all of these?\"\n• \"How do I apply for the third scheme?\""
        });
        addToHistory("assistant", "I found " + d.matches.length + " schemes for you.");

      } else if (d.intent === "explain" && d.explanation) {
        if (d.activeSchemeId) setActiveSchemeId(d.activeSchemeId);
        push({ role:"bot", type:"explain", understanding: d.understanding, explanation: d.explanation });
        addToHistory("assistant", d.understanding);
        setTimeout(() => botSay("Is there anything else you would like to know? 😊"), 400);

      } else if (d.intent === "chat" || d.message) {
        const msg = d.message || d.understanding || "I'm here to help!";
        push({ role:"bot", type:"chat", content: msg, options: d.suggestedOptions || [] });
        addToHistory("assistant", msg);

      } else if (d.matches?.length > 0) {
        setLastResults(d.matches);
        push({ role:"bot", type:"schemes", understanding: d.understanding, schemes: d.matches, count: d.totalSchemesAnalyzed, followUp: "Would you like me to explain any of these?" });

      } else {
        const fallback = d.understanding || d.message || "Could you tell me a bit more? I'm here to help!";
        botSay(fallback);
        addToHistory("assistant", fallback);
      }

    } catch(e) {
      setBusy(false);
      const errMsg = e?.response?.status === 504
        ? "This is taking a bit longer than usual. Please try again!"
        : "Something went wrong. Please try again in a moment.";
      push({ role:"bot", type:"error", content: errMsg });
    }
  }

  function handleSubmit(text) {
    const val = (text || input).trim();
    if (!val || busy) return;
    setShowWelcome(false);
    setInput("");
    push({ role:"user", type:"chat", content: val });
    sendMessage(val);
  }

  return (
    <div style={{height:"100vh",display:"flex",flexDirection:"column",fontFamily:"'Plus Jakarta Sans',system-ui,sans-serif",overflow:"hidden",background:"#f8faff"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body,html,#root{height:100%;font-family:'Plus Jakarta Sans',system-ui,sans-serif;}
        ::-webkit-scrollbar{width:4px;}
        ::-webkit-scrollbar-thumb{background:rgba(99,102,241,0.2);border-radius:4px;}
        @keyframes su{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes nb{0%,60%,100%{transform:translateY(0);opacity:0.4}30%{transform:translateY(-7px);opacity:1}}
        @keyframes glow{0%,100%{opacity:0.7}50%{opacity:1}}
        @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}
        a{transition:opacity 0.15s;}a:hover{opacity:0.85;}
        input:focus{outline:none;}
        button:active{transform:scale(0.97)!important;}
      `}</style>

      {/* HEADER */}
      <div style={{display:"flex",alignItems:"center",gap:"14px",padding:"14px 28px",background:"#fff",borderBottom:"1px solid #e8ecf4",boxShadow:"0 2px 24px rgba(99,102,241,0.08)",flexShrink:0,zIndex:10}}>
        <div style={{width:"48px",height:"48px",borderRadius:"16px",background:"linear-gradient(135deg,#6366f1,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"24px",flexShrink:0,boxShadow:"0 6px 20px rgba(99,102,241,0.45)",animation:"pulse 3s ease-in-out infinite"}}>🏛️</div>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
            <span style={{fontSize:"22px",fontWeight:"800",color:"#0f172a",letterSpacing:"-0.5px"}}>NILAI</span>
            <span style={{fontSize:"11px",fontWeight:"700",color:"#8b5cf6",background:"#f3f0ff",borderRadius:"8px",padding:"3px 10px"}}>AI ADVISOR</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:"6px",marginTop:"2px"}}>
            <div style={{width:"6px",height:"6px",borderRadius:"50%",background:"#6366f1",animation:"glow 1.5s infinite"}}/>
            <span style={{fontSize:"11px",color:"#6366f1",fontWeight:"500"}}>
              {phase === "results" ? `✅ Found ${lastResults.length} schemes for you` : "AI analyzing government schemes for you"}
            </span>
          </div>
        </div>
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:"10px"}}>
          <div style={{background:"linear-gradient(135deg,#6366f1,#8b5cf6)",borderRadius:"20px",padding:"6px 16px",fontSize:"11px",color:"#fff",fontWeight:"700",boxShadow:"0 4px 12px rgba(99,102,241,0.35)"}}>⚡ AWS Hackathon 2026</div>
          <div style={{display:"flex",alignItems:"center",gap:"6px",background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:"20px",padding:"5px 14px"}}>
            <div style={{width:"7px",height:"7px",borderRadius:"50%",background:"#22c55e",animation:"glow 2s infinite"}}/>
            <span style={{fontSize:"11px",color:"#16a34a",fontWeight:"700"}}>Live</span>
          </div>
        </div>
      </div>

      {/* MESSAGES */}
      <div style={{flex:1,overflowY:"auto",padding:"24px 20px 16px",background:"radial-gradient(circle at 20% 20%, #eef2ff 0%, transparent 40%), radial-gradient(circle at 80% 0%, #f5f3ff 0%, transparent 40%), #f8faff"}}>
        <div style={{maxWidth:"760px",margin:"0 auto"}}>

          {showWelcome && <WelcomeCard onQuickPrompt={q => handleSubmit(q)}/>}

          {msgs.map(msg => (
            msg.role === "user"
              ? <div key={msg.id} style={{display:"flex",justifyContent:"flex-end",gap:"10px",alignItems:"flex-end",marginBottom:"16px",animation:"su 0.3s both"}}>
                  <div style={{background:"linear-gradient(135deg,#6366f1,#8b5cf6)",borderRadius:"22px 22px 4px 22px",padding:"13px 20px",maxWidth:"70%",boxShadow:"0 4px 20px rgba(99,102,241,0.3)"}}>
                    <div style={{fontSize:"15px",color:"#fff",lineHeight:"1.7"}}>{msg.content}</div>
                  </div>
                  <div style={{width:"36px",height:"36px",borderRadius:"50%",background:"linear-gradient(135deg,#0ea5e9,#06b6d4)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"14px",fontWeight:"800",color:"#fff",flexShrink:0,boxShadow:"0 4px 12px rgba(6,182,212,0.35)"}}>U</div>
                </div>
              : <BotMsg key={msg.id} msg={msg} onOption={o => handleSubmit(o)}/>
          ))}

          {busy && (
            <div style={{display:"flex",gap:"12px",alignItems:"center",marginBottom:"16px",animation:"su 0.3s both"}}>
              <Avatar/>
              <Dots/>
            </div>
          )}
          <div ref={bottomRef}/>
        </div>
      </div>

      {/* INPUT */}
      <div style={{padding:"16px 20px 20px",background:"#fff",borderTop:"1px solid #e8ecf4",boxShadow:"0 -4px 24px rgba(0,0,0,0.06)",flexShrink:0}}>
        <div style={{maxWidth:"760px",margin:"0 auto"}}>
          <div style={{display:"flex",gap:"10px",alignItems:"center",background:"#f8faff",border:"2px solid #e0e7ff",borderRadius:"18px",padding:"8px 8px 8px 20px",transition:"border-color 0.2s, box-shadow 0.2s"}}
            onFocusCapture={e=>{e.currentTarget.style.borderColor="#6366f1";e.currentTarget.style.boxShadow="0 0 0 4px rgba(99,102,241,0.1)";}}
            onBlurCapture={e=>{e.currentTarget.style.borderColor="#e0e7ff";e.currentTarget.style.boxShadow="none";}}
          >
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); handleSubmit(); }}}
              placeholder="Type anything — just chat naturally with me! 😊"
              style={{flex:1,background:"transparent",border:"none",outline:"none",color:"#0f172a",fontSize:"15px",fontFamily:"inherit",padding:"8px 0",caretColor:"#6366f1"}}
            />
            <button onClick={() => handleSubmit()} disabled={!input.trim() || busy}
              style={{
                width:"46px",height:"46px",borderRadius:"14px",border:"none",
                background:input.trim()&&!busy?"linear-gradient(135deg,#6366f1,#8b5cf6)":"#f1f5f9",
                color:input.trim()&&!busy?"#fff":"#cbd5e1",
                fontSize:"18px",cursor:input.trim()&&!busy?"pointer":"default",
                display:"flex",alignItems:"center",justifyContent:"center",
                flexShrink:0,transition:"all 0.2s",fontFamily:"inherit",
                boxShadow:input.trim()&&!busy?"0 4px 16px rgba(99,102,241,0.4)":"none",
              }}
            >{busy ? "⏳" : "➤"}</button>
          </div>
          {phase === "results" && (
            <div style={{display:"flex",justifyContent:"center",marginTop:"8px"}}>
              <button onClick={() => window.location.reload()} style={{background:"transparent",border:"none",fontSize:"12px",color:"#94a3b8",cursor:"pointer",fontFamily:"inherit",padding:"4px 12px"}}>
                🔄 Start a new search
              </button>
            </div>
          )}
          <div style={{textAlign:"center",marginTop:"6px",fontSize:"11px",color:"#cbd5e1",letterSpacing:"0.3px"}}>
            Built with ❤️ by FemBytes · Powered by Amazon Bedrock · AWS Hackathon 2026
          </div>
        </div>
      </div>

      {phase === "results" && (
        <div style={{position:"fixed",bottom:"110px",right:"24px",width:"52px",height:"52px",borderRadius:"50%",background:"linear-gradient(135deg,#6366f1,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"24px",boxShadow:"0 8px 28px rgba(99,102,241,0.5)",cursor:"pointer",animation:"pulse 2s ease-in-out infinite",zIndex:100}} title="Ask NILAI anything">🤖</div>
      )}
    </div>
  );
}