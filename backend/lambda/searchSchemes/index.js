const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand } = require("@aws-sdk/lib-dynamodb");

const bedrockClient = new BedrockRuntimeClient({ region: "ap-south-1" });
const dynamoClient = new DynamoDBClient({ region: "ap-south-1" });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const decoder = new TextDecoder();

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
  "Access-Control-Allow-Methods": "POST,OPTIONS,GET",
  "Content-Type": "application/json"
};

let cachedSchemes = null;

async function getAllSchemes() {
  if (cachedSchemes) return cachedSchemes;
  let items = [], lastKey;
  do {
    const r = await docClient.send(new ScanCommand({ TableName: "nilai-schemes", ExclusiveStartKey: lastKey }));
    items = items.concat(r.Items || []);
    lastKey = r.LastEvaluatedKey;
  } while (lastKey);
  cachedSchemes = items;
  console.log("Loaded", items.length, "schemes into cache");
  return cachedSchemes;
}

async function callNova(prompt, maxTokens = 2000, temperature = 0.5) {
  try {
    const response = await bedrockClient.send(new InvokeModelCommand({
      modelId: "apac.amazon.nova-lite-v1:0",
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        messages: [{ role: "user", content: [{ text: prompt }] }],
        inferenceConfig: { maxTokens, temperature }
      })
    }));
    const body = JSON.parse(decoder.decode(response.body));
    return body?.output?.message?.content?.[0]?.text || "";
  } catch (err) {
    console.error("Nova error:", err);
    throw new Error("AI error: " + err.message);
  }
}

function parseUserInfo(profile) {
  const ag = (profile.ageGender || "").toLowerCase();
  const age = parseInt((ag.match(/(\d+)/) || [])[1]) || 0;
  const gender = ag.includes("female") || ag.includes("woman") || ag.includes("girl") ? "female"
    : ag.includes("male") || ag.includes("man") ? "male" : "ALL";
  const loc = (profile.location || "").toLowerCase();
  const state = loc.includes("tamil") || loc.includes("chennai") || loc.includes("coimbatore") ||
    loc.includes("madurai") || loc.includes("trichy") || loc.includes("ooty") || loc.includes("salem") ||
    loc.includes("tirunelveli") || loc.includes("vellore") || loc.includes("erode") || loc.includes("tirupur")
    ? "Tamil Nadu"
    : loc.includes("maharashtra") || loc.includes("mumbai") || loc.includes("pune") ? "Maharashtra"
    : loc.includes("karnataka") || loc.includes("bangalore") || loc.includes("bengaluru") ? "Karnataka"
    : loc.includes("andhra") ? "Andhra Pradesh"
    : loc.includes("telangana") || loc.includes("hyderabad") ? "Telangana"
    : loc.includes("kerala") ? "Kerala"
    : loc.includes("rajasthan") ? "Rajasthan"
    : loc.includes("gujarat") ? "Gujarat"
    : loc.includes("uttar pradesh") || loc.includes("lucknow") ? "Uttar Pradesh"
    : loc.includes("west bengal") || loc.includes("kolkata") ? "West Bengal"
    : loc.includes("punjab") ? "Punjab"
    : loc.includes("haryana") ? "Haryana"
    : loc.includes("bihar") ? "Bihar"
    : loc.includes("odisha") ? "Odisha"
    : loc.includes("madhya pradesh") ? "Madhya Pradesh"
    : "ALL";
  const c = (profile.caste || "").toLowerCase();
  const caste = c.includes("sc") || c.includes("scheduled caste") || c.includes("dalit") ? "SC"
    : c.includes("st") || c.includes("scheduled tribe") || c.includes("tribal") ? "ST"
    : c.includes("obc") || c.includes("bc") || c.includes("mbc") || c.includes("other backward") ? "OBC"
    : c.includes("minority") || c.includes("muslim") || c.includes("christian") || c.includes("sikh") ? "minority"
    : "General";
  const incomeRaw = (profile.occupation || "").toLowerCase();
  const monthlyMatch = incomeRaw.match(/(\d[\d,]*)/);
  let income = null, incomeDisplay = "";
  if (monthlyMatch) {
    const monthly = parseInt(monthlyMatch[1].replace(/,/g, ""));
    if (monthly < 100000) {
      income = monthly * 12;
      incomeDisplay = "Rs." + monthly.toLocaleString("en-IN") + "/month (Rs." + income.toLocaleString("en-IN") + "/year)";
    } else {
      income = monthly;
      incomeDisplay = "Rs." + monthly.toLocaleString("en-IN") + "/year";
    }
  }
  return { age, gender, state, caste, income, incomeDisplay };
}

// ── STEP 1: HARD FILTER — eliminates obviously ineligible schemes ────────────
function hardFilterSchemes(schemes, ui) {
  return schemes.filter(s => {
    const e = s.eligibility || {};

    // Gender filter
    if (e.gender && e.gender !== "ALL" && ui.gender !== "ALL" && e.gender !== ui.gender) return false;

    // State filter — keep ALL (national) or matching state
    if (e.state && e.state !== "ALL" && s.state && s.state !== "ALL" && ui.state !== "ALL") {
      if (s.state !== ui.state) return false;
    }

    // Age filter
    if (ui.age > 0) {
      const ageMin = e.ageMin || 0;
      const ageMax = e.ageMax || 99;
      if (ageMin > ui.age) return false;
      if (ageMax < ui.age) return false;
    }

    // Income filter
    if (ui.income && e.incomeLimit && e.incomeLimit > 0) {
      if (ui.income > e.incomeLimit * 1.2) return false; // 20% buffer for edge cases
    }

    return true;
  });
}

// ── STEP 2: KEYWORD RELEVANCE SCORING — finds most relevant schemes fast ────
function keywordScore(scheme, query, profile) {
  const searchText = (
    query + " " +
    (profile.problem || "") + " " +
    (profile.occupation || "")
  ).toLowerCase();

  const schemeName = (scheme.name || "").toLowerCase();
  const schemeDesc = (scheme.description || "").toLowerCase();
  const schemeTags = (scheme.tags || "").toLowerCase();
  const schemeCondition = ((scheme.eligibility || {}).condition || "").toLowerCase();
  const schemeBenefit = (scheme.benefitAmount || "").toLowerCase();
  const schemeCategory = (scheme.category || "").toLowerCase();

  let score = 0;

  // Category keyword mapping
  const categoryKeywords = {
    education: ["education","study","school","college","scholarship","student","learn","fees","tuition","degree","academic"],
    health: ["health","medical","hospital","medicine","treatment","disease","doctor","surgery","insurance","illness"],
    agriculture: ["farmer","farm","crop","agriculture","kisan","seed","irrigation","soil","harvest","agricultural"],
    housing: ["house","home","shelter","construction","building","repair","dwelling","accommodation","flat"],
    employment: ["job","work","employment","skill","training","career","livelihood","income","business","workshop"],
    finance: ["loan","credit","finance","money","fund","grant","subsidy","financial","bank","investment"],
    women: ["women","woman","female","girl","widow","mother","mahila","self help","shg","entrepreneur"],
    "social welfare": ["welfare","pension","disability","elderly","old age","orphan","destitute","poor","bpl"],
    insurance: ["insurance","accident","death","life cover","premium","claim"]
  };

  // Boost if query matches category
  for (const [cat, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some(k => searchText.includes(k))) {
      if (schemeCategory === cat) score += 15;
    }
  }

  // Direct word matches in scheme name (highest weight)
  const queryWords = searchText.split(/\s+/).filter(w => w.length > 3);
  for (const word of queryWords) {
    if (schemeName.includes(word)) score += 10;
    if (schemeTags.includes(word)) score += 6;
    if (schemeCondition.includes(word)) score += 4;
    if (schemeDesc.includes(word)) score += 2;
  }

  // Single parent / special situations
  if (searchText.includes("single parent") || searchText.includes("widow") || searchText.includes("single mother")) {
    if (schemeName.includes("widow") || schemeName.includes("single") || schemeCondition.includes("widow") ||
        schemeCondition.includes("single parent") || schemeName.includes("destitute")) score += 20;
  }

  // Tailor / self employed
  if (searchText.includes("tailor") || searchText.includes("sewing") || searchText.includes("self employed")) {
    if (schemeCondition.includes("self-employed") || schemeCondition.includes("artisan") ||
        schemeTags.includes("self") || schemeCondition.includes("unorganised")) score += 15;
  }

  // Female bonus if gender matches
  if (profile.ageGender && profile.ageGender.toLowerCase().includes("female")) {
    if ((scheme.eligibility || {}).gender === "female") score += 8;
  }

  // Central schemes get slight boost (available everywhere)
  if (scheme.level === "Central") score += 2;

  return score;
}

// ── STEP 3: SMART PRE-FILTER — returns top N most relevant schemes ───────────
function smartPreFilter(schemes, query, profile, topN = 40) {
  const scored = schemes.map(s => ({ s, score: keywordScore(s, query, profile) }));
  scored.sort((a, b) => b.score - a.score);

  // Only keep schemes with at least some relevance score
  const relevant = scored.filter(x => x.score > 0);
  console.log(`Keyword filtered: ${relevant.length} relevant out of ${schemes.length}`);

  return relevant.slice(0, topN).map(x => x.s);
}

function buildSchemeText(s) {
  const e = s.eligibility || {};
  return `SCHEME_ID: ${s.schemeId}
Name: ${s.name}
Category: ${s.category} | Level: ${s.level || s.state || "National"}
Benefit: ${s.benefitAmount || "See official website"}
Eligibility: ${(e.condition || "").substring(0, 300)}
Documents: ${(s.documents || []).slice(0,5).join(", ")}
Apply: ${(s.applicationProcess || "").substring(0, 200)}`;
}

// ── FIND REFERENCED SCHEME ────────────────────────────────────────────────────
function findReferencedScheme(query, previousSchemes, activeSchemeId, allSchemes) {
  const q = query.toLowerCase();

  // Search all schemes by name score
  if (allSchemes && allSchemes.length > 0) {
    const queryWords = q.replace(/[^a-z0-9\s]/g,"").split(/\s+/)
      .filter(w => w.length > 3 && !["what","tell","about","this","that","scheme","please","explain","eligib","criteria","documents","apply"].includes(w));

    if (queryWords.length > 0) {
      const scored = allSchemes.map(s => {
        const nameLower = (s.name || "").toLowerCase();
        const idLower = (s.schemeId || "").toLowerCase();
        let score = 0;
        for (const qw of queryWords) {
          if (nameLower.includes(qw)) score += 3;
          if (idLower.includes(qw)) score += 2;
        }
        return { s, score };
      }).filter(x => x.score >= 3).sort((a,b) => b.score - a.score);

      if (scored.length > 0) {
        console.log("Name match:", scored[0].s.name, "score:", scored[0].score);
        return scored[0].s;
      }
    }
  }

  if (!previousSchemes || previousSchemes.length === 0) return null;

  // Ordinal references
  const ordinals = ["first","second","third","fourth","fifth","1st","2nd","3rd","4th","5th"];
  const idxMap =   [0,     1,       2,      3,       4,     0,    1,    2,    3,    4];
  for (let i = 0; i < ordinals.length; i++) {
    if (q.includes(ordinals[i]) && previousSchemes[idxMap[i]]) return previousSchemes[idxMap[i]];
  }
  if (q.includes("last")) return previousSchemes[previousSchemes.length - 1];

  const numMatch = q.match(/scheme\s*[#]?\s*(\d)/);
  if (numMatch && previousSchemes[parseInt(numMatch[1])-1]) return previousSchemes[parseInt(numMatch[1])-1];

  for (const s of previousSchemes) {
    const words = (s.name || "").toLowerCase().split(" ").filter(w => w.length > 4);
    if (words.some(w => q.includes(w))) return s;
  }

  const contextWords = ["this scheme","that scheme","the scheme","about it","how to apply","documents needed","apply for it"];
  if (contextWords.some(w => q.includes(w)) && activeSchemeId) {
    return (previousSchemes||[]).find(s => s.schemeId === activeSchemeId) || null;
  }
  return null;
}

// ── EXPLAIN SCHEME ────────────────────────────────────────────────────────────
async function explainScheme(scheme, userMessage, profile, allSchemes) {
  const fullScheme = allSchemes.find(s => s.schemeId === scheme.schemeId) || scheme;
  const ui = parseUserInfo(profile);

  const profileSummary = [
    profile.problem && "Problem: " + profile.problem,
    profile.ageGender && "Age/Gender: " + profile.ageGender,
    profile.location && "Location: " + profile.location,
    profile.caste && "Caste: " + profile.caste,
    profile.occupation && "Occupation: " + profile.occupation,
    ui.incomeDisplay && "Income: " + ui.incomeDisplay
  ].filter(Boolean).join(" | ");

  const prompt = `You are NILAI, a warm caring AI advisor helping people understand Indian government schemes.

USER PROFILE: ${profileSummary}

THE SCHEME (answer ONLY about this, no other scheme):
${buildSchemeText(fullScheme)}
Description: ${(fullScheme.description || "").substring(0,400)}

USER'S QUESTION: "${userMessage}"

RULES:
- Answer ONLY about "${fullScheme.name}" — never mention or confuse with another scheme
- Answer exactly what was asked (eligibility = who qualifies; documents = what papers; apply = steps)
- Make it personal using their real details
- Warm flowing paragraphs, NO bullet points, NO bold, NO markdown
- Under 230 words
- Only use facts from scheme data above — never invent

Return ONLY JSON:
{
  "understanding": "One warm sentence about their question on ${fullScheme.name}",
  "explanation": "Your full warm personal answer"
}`;

  const raw = await callNova(prompt, 700, 0.5);
  try {
    const m = raw.replace(/```json|```/g,"").trim().match(/\{[\s\S]*\}/);
    return JSON.parse(m ? m[0] : raw);
  } catch(e) {
    return { understanding: `Let me explain ${fullScheme.name} for you.`, explanation: raw.replace(/```json|```|\{|\}/g,"").trim() };
  }
}

// ── MULTI-SCHEME CHECK ────────────────────────────────────────────────────────
async function checkAllSchemesEligibility(schemes, profile, allSchemes) {
  const profileSummary = [
    profile.problem && "Problem: " + profile.problem,
    profile.ageGender && "Age/Gender: " + profile.ageGender,
    profile.location && "Location: " + profile.location,
    profile.caste && "Caste: " + profile.caste,
    profile.occupation && "Occupation/Income: " + profile.occupation
  ].filter(Boolean).join(", ");

  const checks = await Promise.all(schemes.map(async s => {
    const full = allSchemes.find(sc => sc.schemeId === s.schemeId) || s;
    const e = full.eligibility || {};
    const prompt = `You are NILAI, a warm friendly AI. User: ${profileSummary}
Check eligibility for: ${full.name}
Eligibility rules: ${(e.condition||"").substring(0,300)}
Benefit: ${full.benefitAmount}
Write 2-3 warm sentences: scheme name, YES/NO, personal reason. No bullet points. No JSON.`;
    const result = await callNova(prompt, 250, 0.5);
    return result.replace(/```json|```/g,"").trim();
  }));
  return checks.join("\n\n");
}

// ── SEARCH SCHEMES — the main intelligence ────────────────────────────────────
async function searchSchemes(profile, allSchemes, previousSchemes, specificQuery) {
  const ui = parseUserInfo(profile);

  // Step 1: Hard filter by age/gender/state/income
  const hardFiltered = hardFilterSchemes(allSchemes, ui);
  console.log("After hard filter:", hardFiltered.length);

  // Step 2: Keyword relevance scoring — pick top 40 most relevant
  const searchQuery = specificQuery || profile.problem || "";
  const topSchemes = smartPreFilter(hardFiltered, searchQuery, profile, 40);
  console.log("After smart filter:", topSchemes.length);

  const prevContext = previousSchemes.length
    ? "\nAlready shown: " + previousSchemes.map((s,i) => `${i+1}. ${s.name}`).join(", ") + "\nDo NOT repeat these."
    : "";

  const profileSummary = [
    profile.problem && "Problem: " + profile.problem,
    profile.ageGender && "Age/Gender: " + profile.ageGender,
    profile.location && "Location: " + profile.location,
    profile.caste && "Caste: " + profile.caste,
    profile.occupation && "Occupation/Income: " + profile.occupation,
    ui.incomeDisplay && "Calculated income: " + ui.incomeDisplay
  ].filter(Boolean).join(" | ");

  const specificFocus = specificQuery
    ? `\nSPECIFIC REQUEST: "${specificQuery}" — prioritize schemes addressing THIS directly.`
    : "";

  const schemeList = topSchemes.map(buildSchemeText).join("\n---\n");

  const prompt = `You are NILAI, a warm intelligent AI helping people in India find government schemes.

USER PROFILE: ${profileSummary}${prevContext}${specificFocus}

CANDIDATE SCHEMES (pre-filtered for eligibility — pick the best 3-5):
${schemeList}

YOUR TASK: Find the 3 to 5 schemes that MOST genuinely help this specific person RIGHT NOW.

STRICT RULES:
- NEVER recommend marriage schemes unless user mentioned marriage
- NEVER recommend pregnancy/maternity unless user mentioned pregnancy
- NEVER recommend farmer schemes unless user is a farmer
- For "single parent" queries: look for widow support, women welfare, destitute support, livelihood schemes
- whyItMatches must be personal — use their real details (age, location, income, situation)
- NEVER invent benefit amounts — only use data from the list above
- If a scheme is state-specific, only recommend if it matches the user's state

Return ONLY valid JSON:
{
  "understanding": "2-3 warm personal sentences showing you understood their exact situation",
  "matches": [
    { "schemeId": "exact-id-from-list", "relevanceScore": 95, "whyItMatches": "2-3 warm personal sentences using their real details" },
    { "schemeId": "exact-id-from-list", "relevanceScore": 88, "whyItMatches": "personal warm reason" },
    { "schemeId": "exact-id-from-list", "relevanceScore": 80, "whyItMatches": "personal warm reason" }
  ]
}`;

  const raw = await callNova(prompt, 1500, 0.5);
  try {
    const m = raw.replace(/```json|```/g,"").trim().match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(m ? m[0] : raw);
    const enriched = (parsed.matches||[]).map(match => {
      const s = allSchemes.find(sc => sc.schemeId === match.schemeId);
      if (!s) { console.warn("Unknown schemeId:", match.schemeId); return null; }
      return { ...match, name:s.name, category:s.category, benefitAmount:s.benefitAmount,
        description:s.description, officialLink:s.officialLink, state:s.state,
        documents:s.documents, applicationProcess:s.applicationProcess };
    }).filter(Boolean);
    return { understanding: parsed.understanding || "", matches: enriched };
  } catch(e) {
    const fallback = topSchemes.slice(0,3).map((s,i) => ({
      schemeId:s.schemeId, relevanceScore:90-i*10, whyItMatches:"This scheme matches your profile.",
      name:s.name, category:s.category, benefitAmount:s.benefitAmount,
      description:s.description, officialLink:s.officialLink, state:s.state,
      documents:s.documents, applicationProcess:s.applicationProcess
    }));
    return { understanding:"Here are the best schemes I found for you.", matches:fallback };
  }
}

// ── CONVERSATION MANAGER ──────────────────────────────────────────────────────
async function handleConversation(userMessage, conversationHistory, profile, previousSchemes, activeSchemeId, allSchemes) {
  const profileSummary = Object.entries(profile).filter(([,v]) => v).map(([k,v]) => `${k}: ${v}`).join(" | ") || "Nothing yet";
  const historyText = conversationHistory.slice(-8).map(m => `${m.role==="user"?"User":"NILAI"}: ${m.content}`).join("\n");
  const missingFields = [
    !profile.problem && "problem/situation",
    !profile.ageGender && "age & gender",
    !profile.location && "state & district",
    !profile.caste && "caste category",
    !profile.occupation && "occupation & income"
  ].filter(Boolean);

  const prompt = `You are NILAI — a warm, intelligent, caring AI advisor helping people in India discover government schemes. You speak like a kind helpful friend — natural, warm, never robotic.

CONVERSATION SO FAR:
${historyText || "Start of conversation."}

CURRENT MESSAGE: "${userMessage}"
PROFILE SO FAR: ${profileSummary}

GOAL: Collect these 5 details through friendly conversation:
1. Problem/situation (what help they need) ← ask this first
2. Age and gender
3. State and district
4. Caste (General / OBC-BC-MBC / SC / ST / Minority)
5. Occupation and monthly income

RULES:
- ALWAYS respond to what they said FIRST, then ask your question
- Extract info from their message — don't ask for something they already said
- If unclear, ask gently for clarification
- Accept "I don't know" or "skip" and move on
- You can ask 2 things at once if natural
- When ALL 5 collected → set readyToSearch: true

MISSING: ${missingFields.join(", ") || "ALL COLLECTED → set readyToSearch: true NOW"}

Return ONLY valid JSON:
{
  "message": "Your warm natural response — acknowledge what they said, then ask what's needed next. No lists. Conversational.",
  "extractedInfo": {
    "problem": "extracted or null",
    "ageGender": "extracted or null",
    "location": "extracted or null",
    "caste": "extracted or null",
    "occupation": "extracted or null"
  },
  "readyToSearch": false,
  "suggestedOptions": []
}

NOTE: suggestedOptions — only fill when asking about caste: ["General","OBC-BC-MBC","SC","ST","Minority"]`;

  const raw = await callNova(prompt, 700, 0.7);
  try {
    const m = raw.replace(/```json|```/g,"").trim().match(/\{[\s\S]*\}/);
    return JSON.parse(m ? m[0] : raw);
  } catch(e) {
    return { message: raw.replace(/```json|```|\{|\}/g,"").trim() || "Could you tell me what kind of help you're looking for?", extractedInfo:{}, readyToSearch:false, suggestedOptions:[] };
  }
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode:200, headers, body:"" };

  try {
    const body = JSON.parse(event.body || "{}");
    const userMessage = (body.query || "").trim().slice(0, 600);
    const profile = body.userProfile || {};
    const previousSchemes = body.previousSchemes || [];
    const activeSchemeId = body.activeSchemeId || null;
    const conversationHistory = body.conversationHistory || [];
    const phase = body.phase || "collect";

    if (!userMessage) return { statusCode:400, headers, body:JSON.stringify({ error:"No query" }) };
    console.log("MSG:", userMessage.substring(0,80), "| Phase:", phase, "| DB schemes:", cachedSchemes ? cachedSchemes.length : "not loaded");

    const allSchemes = await getAllSchemes();

    // ── RESULTS PHASE ─────────────────────────────────────────────────────────
    if (phase === "results") {

      // Multi-eligibility check
      const isMulti = /am i eligible|do i qualify|can i apply|which ones|these schemes|all of them|eligible for all|qualify for all/i.test(userMessage);
      if (isMulti && previousSchemes.length > 0) {
        const combined = await checkAllSchemesEligibility(previousSchemes, profile, allSchemes);
        return { statusCode:200, headers, body:JSON.stringify({
          success:true, intent:"explain",
          understanding:"Let me check each of those schemes for you one by one!",
          explanation:"Let me check each of those schemes for you one by one!\n\n" + combined,
          activeSchemeId:null, matches:[], phase:"results"
        })};
      }

      // New search request
      const isNewSearch = /is there|any scheme|schemes for|other scheme|different scheme|what about|find me|search for|show me|are there|more schemes/i.test(userMessage);
      if (isNewSearch) {
        const result = await searchSchemes(profile, allSchemes, previousSchemes, userMessage);
        if (result.matches.length > 0) {
          return { statusCode:200, headers, body:JSON.stringify({
            success:true, intent:"search",
            understanding:result.understanding, matches:result.matches,
            totalSchemesAnalyzed:allSchemes.length,
            updatedProfile:profile, phase:"results"
          })};
        }
      }

      // Specific scheme reference
      const ref = findReferencedScheme(userMessage, previousSchemes, activeSchemeId, allSchemes);
      if (ref) {
        console.log("Explain:", ref.name);
        const result = await explainScheme(ref, userMessage, profile, allSchemes);
        return { statusCode:200, headers, body:JSON.stringify({
          success:true, intent:"explain",
          understanding:result.understanding, explanation:result.explanation,
          activeSchemeId:ref.schemeId, matches:[], phase:"results"
        })};
      }

      // General chat
      const conv = await handleConversation(userMessage, conversationHistory, profile, previousSchemes, activeSchemeId, allSchemes);
      return { statusCode:200, headers, body:JSON.stringify({
        success:true, intent:"chat", message:conv.message, matches:[], phase:"results"
      })};
    }

    // ── COLLECT PHASE ─────────────────────────────────────────────────────────
    const conv = await handleConversation(userMessage, conversationHistory, profile, previousSchemes, activeSchemeId, allSchemes);
    const updatedProfile = { ...profile };
    if (conv.extractedInfo) {
      Object.entries(conv.extractedInfo).forEach(([k,v]) => {
        if (v && v !== "null") updatedProfile[k] = v;
      });
    }

    if (conv.readyToSearch) {
      const result = await searchSchemes(updatedProfile, allSchemes, previousSchemes);
      return { statusCode:200, headers, body:JSON.stringify({
        success:true, intent:"search",
        understanding:result.understanding, matches:result.matches,
        totalSchemesAnalyzed:allSchemes.length,
        updatedProfile, phase:"results",
        transitionMessage:conv.message
      })};
    }

    return { statusCode:200, headers, body:JSON.stringify({
      success:true, intent:"chat",
      message:conv.message,
      suggestedOptions:conv.suggestedOptions || [],
      updatedProfile, phase:"collect"
    })};

  } catch(err) {
    console.error("Error:", err);
    return { statusCode:500, headers, body:JSON.stringify({ error:"Something went wrong. Please try again.", details:err.message }) };
  }
};
