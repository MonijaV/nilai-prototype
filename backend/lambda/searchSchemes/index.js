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
  const gender = ag.includes("female") || ag.includes("woman") || ag.includes("girl") || ag.includes("widow") || ag.includes("single mother") ? "female"
    : ag.includes("male") || ag.includes("man") || ag.includes("father") ? "male" : "ALL";
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

    // ── STATE FILTER — state is stored at TOP LEVEL s.state, not inside eligibility ──
    // Keep scheme if: it's national (ALL), state matches user, or state is unknown ("State")
    if (ui.state !== "ALL") {
      const schemeState = (s.state || "ALL").trim();
      if (schemeState !== "ALL" && schemeState !== "State" && schemeState !== ui.state) {
        return false; // wrong state — filter out
      }
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
      if (ui.income > e.incomeLimit * 1.2) return false;
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

  // Single parent / widow / special situations — boost truly relevant schemes
  if (searchText.includes("single parent") || searchText.includes("widow") || searchText.includes("single mother")) {
    if (schemeName.includes("widow") || schemeName.includes("single") || schemeCondition.includes("widow") ||
        schemeCondition.includes("single parent") || schemeName.includes("destitute") ||
        schemeName.includes("mahila") || schemeName.includes("women welfare") ||
        schemeCondition.includes("destitute") || schemeTags.includes("widow")) score += 25;
    // Heavily penalize completely irrelevant schemes
    if (schemeName.includes("transgender") || schemeName.includes("girl child") && !searchText.includes("girl")) score -= 50;
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

  // ── PRIORITY 1: Ordinals = shown cards (first/second/third) ────────────────
  if (previousSchemes && previousSchemes.length > 0) {
    const ordinals = ["first","second","third","fourth","fifth","1st","2nd","3rd","4th","5th"];
    const idxMap =   [0,     1,       2,      3,       4,     0,    1,    2,    3,    4];
    for (let i = 0; i < ordinals.length; i++) {
      if (q.includes(ordinals[i]) && previousSchemes[idxMap[i]]) {
        console.log("Ordinal->card #"+(idxMap[i]+1), previousSchemes[idxMap[i]].name);
        return previousSchemes[idxMap[i]];
      }
    }
    if (q.includes("last")) return previousSchemes[previousSchemes.length - 1];
    const numMatch = q.match(/scheme\s*[#]?\s*(\d)/);
    if (numMatch && previousSchemes[parseInt(numMatch[1])-1]) return previousSchemes[parseInt(numMatch[1])-1];
    const contextWords = ["this scheme","that scheme","the scheme","about it","how to apply","documents needed","apply for it"];
    if (contextWords.some(w => q.includes(w)) && activeSchemeId) {
      const active = previousSchemes.find(s => s.schemeId === activeSchemeId);
      if (active) return active;
    }
    for (const s of previousSchemes) {
      const words = (s.name || "").toLowerCase().split(" ").filter(w => w.length > 4);
      if (words.some(w => q.includes(w))) return s;
    }
  }

  // ── PRIORITY 2: Named specific scheme (needs 2+ meaningful words) ────────
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

STRICT ELIGIBILITY RULES — violating these means a wrong recommendation:
1. STATE: User is in ${ui.state}. ONLY recommend schemes where state="${ui.state}" OR level="Central". NEVER recommend schemes from other states (Delhi, Haryana, Jharkhand, etc.)
2. RELEVANCE: ONLY recommend schemes that match the user's ACTUAL situation:
   - Single parent/widow → look for widow welfare, women support, destitute, mahila, livelihood
   - Student → scholarships, education support only
   - Farmer → agriculture schemes only
   - Unemployed → employment, skill training, livelihood
3. NEVER recommend:
   - Transgender schemes unless user mentioned transgender
   - Girl child schemes unless user mentioned girl child
   - Farmer schemes unless user is a farmer
   - Disability schemes unless user mentioned disability
   - Marriage schemes unless user mentioned marriage
   - Pregnancy/maternity unless user mentioned pregnancy
4. whyItMatches must use their REAL details — age, state, income, situation
5. NEVER invent or modify benefit amounts — use exact data only
6. If fewer than 3 genuinely eligible schemes exist, return only those — do NOT pad with irrelevant schemes

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
// Designed as a human advisor — NOT a form. Understands context, extracts info
// intelligently, asks only what's truly missing, and never ignores user's message.
async function handleConversation(userMessage, conversationHistory, profile, previousSchemes, activeSchemeId, allSchemes) {

  const profileSummary = Object.entries(profile).filter(([,v]) => v)
    .map(([k,v]) => `${k}: ${v}`).join(" | ") || "Nothing collected yet";

  const historyText = conversationHistory.slice(-10)
    .map(m => `${m.role === "user" ? "User" : "NILAI"}: ${m.content}`)
    .join("\n");

  const missingFields = [
    !profile.problem    && "problem/need",
    !profile.ageGender  && "age & gender",
    !profile.location   && "state/district",
    !profile.caste      && "caste category",
    !profile.occupation && "occupation & income"
  ].filter(Boolean);

  const prompt = `You are NILAI — a warm, intelligent AI advisor helping people in India discover government schemes they are eligible for. You behave exactly like a knowledgeable, empathetic human advisor — never like a form or questionnaire.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONVERSATION HISTORY:
${historyText || "(start of conversation)"}

USER'S CURRENT MESSAGE: "${userMessage}"

PROFILE COLLECTED SO FAR: ${profileSummary}
STILL NEEDED: ${missingFields.join(", ") || "ALL INFO COLLECTED — trigger search now"}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

YOUR BEHAVIOR RULES:

RULE 1 — UNDERSTAND FIRST, ASK LATER
Read the user's message carefully. Extract every piece of useful information before deciding what to ask. Never ask for something already mentioned.

RULE 2 — INTELLIGENT EXTRACTION
From any natural message, extract:
- Age: any number ("I am 23", "20 year old", "age 45")
- Gender: woman/man/female/male/girl/boy/widow/mother/father/husband/wife
- Location: any city, district, or state name mentioned
- Caste: OBC/BC/MBC/SC/ST/General/Minority/Brahmin/Muslim/Christian
- Occupation: student/farmer/tailor/unemployed/housewife/worker/engineer/any job
- Income: any ₹ amount per month/year, OR 0 if unemployed/student
- Problem: infer from context — "can't afford fees" = education, "no job" = employment, "sick" = health
- Family status: widow/single parent/disabled/elderly — these are KEY eligibility factors

RULE 3 — RESPOND TO WHAT THEY SAID FIRST
Always acknowledge their situation with empathy before asking anything. If they shared a problem, show you understood it.

BAD: User says "I am a widow struggling financially" → Bot says "What is your age?"
GOOD: User says "I am a widow struggling financially" → Bot says "I'm so sorry to hear that. There are several schemes specifically for widows that could really help you. To find the best ones, could you share which state you're in and roughly what your monthly income is?"

RULE 4 — SMART QUESTIONING
- Combine multiple missing fields into ONE natural question
- Never ask more than 2 things in one message
- Ask the MOST IMPORTANT missing fields first
- Priority order: location > caste > income (age/gender often inferable from context)
- If someone says "widow" — gender=female is already known, don't ask
- If someone says "student" — occupation=student, problem=education, don't ask these separately
- If someone says "unemployed" — income=0, don't ask for income
- If someone says "farmer" — occupation=farmer, problem=agriculture

RULE 5 — WHEN TO SEARCH
Search immediately when you have enough to find relevant schemes:
- Have: location + (caste OR income OR occupation) + problem → SEARCH
- Have: 4+ fields filled → SEARCH
- User says "find me schemes" / "search now" / "what schemes" → SEARCH with what you have
- Never make user answer more than 3 questions total

RULE 6 — HANDLE SPECIAL SITUATIONS
- "widow" / "single parent" / "disabled" / "elderly" → these are strong eligibility signals, extract them
- If user is frustrated or says "I told you" → apologize, extract from history, proceed
- If user says "skip" / "don't know" → accept it and move forward
- College name, specific disease, business type → these are extra details, don't block on them

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXAMPLE CONVERSATIONS:

Example 1:
User: "I am a widow with two children and struggling financially"
extractedInfo: {problem: "financial support for widow", ageGender: "female", occupation: "widow"}
message: "I'm sorry you're going through this difficult time. There are government schemes specifically designed to support widows and their children. To find the best ones for you, could you tell me which state you live in and your approximate monthly income?"
readyToSearch: false (missing location)

Example 2:
User: "I am 20 years old male engineering student from Chennai, Tamil Nadu, OBC caste, my family income is 3000 per month"
extractedInfo: {problem: "education support", ageGender: "20 male", location: "Chennai Tamil Nadu", caste: "OBC", occupation: "student 3000/month"}
message: "Great, I have all the details I need! Let me search for the best education scholarships and financial support schemes for you right now."
readyToSearch: true

Example 3:
User: "I need help"
message: "Of course, I'm here to help! Could you tell me a bit about your situation — what kind of help are you looking for, and which state are you from?"
readyToSearch: false

Example 4:
User: "I am a farmer in Punjab, SC category, 45 years old"
extractedInfo: {problem: "agriculture support", ageGender: "45", location: "Punjab", caste: "SC", occupation: "farmer"}
message: "I understand you're a farmer in Punjab looking for support. To find the most relevant schemes, what is your approximate monthly or annual income from farming?"
readyToSearch: false (missing income — important for farmer schemes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Return ONLY valid JSON (absolutely no other text, no markdown):
{
  "message": "Your warm, empathetic, natural response. Acknowledge their situation first. Then ask only what is truly needed in one friendly question.",
  "extractedInfo": {
    "problem": "extracted problem/need or null",
    "ageGender": "extracted age and gender or null",
    "location": "extracted city/state or null",
    "caste": "extracted caste or null",
    "occupation": "extracted occupation and income or null"
  },
  "readyToSearch": false,
  "suggestedOptions": []
}

IMPORTANT:
- suggestedOptions: ONLY fill with ["General","OBC-BC-MBC","SC","ST","Minority"] when you are specifically asking about caste category. Otherwise always []
- Set readyToSearch: true when you have enough info (location + any 2 other fields)
- Extract "widow"/"single parent"/"disabled" into the problem AND ageGender/occupation fields`;

  const raw = await callNova(prompt, 1000, 0.4);
  try {
    const m = raw.replace(/```json|```/g, "").trim().match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(m ? m[0] : raw);
    // Safety: ensure suggestedOptions is always an array
    if (!Array.isArray(parsed.suggestedOptions)) parsed.suggestedOptions = [];
    return parsed;
  } catch(e) {
    console.error("Conv parse error:", e.message);
    return {
      message: raw.replace(/```json|```|\{|\}/g, "").trim() || "Could you tell me a bit about what kind of help you're looking for?",
      extractedInfo: {}, readyToSearch: false, suggestedOptions: []
    };
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

    // ── SHORTCUT: If user says "find me schemes" / "search" and profile has enough info ──
    const isSearchIntent = /find.*scheme|search.*scheme|show.*scheme|need.*scheme|get.*scheme|i need scheme|give.*scheme/i.test(userMessage);
    const profileFields = ['ageGender','location','caste'].filter(k => profile[k]);
    if (isSearchIntent && profileFields.length >= 2 && phase === "collect") {
      const enrichedProfile = { ...profile };
      if (!enrichedProfile.problem) enrichedProfile.problem = userMessage;
      const result = await searchSchemes(enrichedProfile, allSchemes, []);
      return { statusCode:200, headers, body:JSON.stringify({
        success:true, intent:"search",
        understanding:result.understanding, matches:result.matches,
        totalSchemesAnalyzed:allSchemes.length,
        updatedProfile:enrichedProfile, phase:"results"
      })};
    }

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

      // New search request — also trigger when user gives new personal info
      const isNewSearch = /is there|any scheme|schemes for|other scheme|different scheme|what about|find me|search for|show me|are there|more schemes|i am a|i am an|i need support|i need help|actually i/i.test(userMessage);
      if (isNewSearch) {
        // Extract any new profile info from this message and merge
        const convForNewInfo = await handleConversation(userMessage, conversationHistory, profile, [], null, allSchemes);
        const mergedProfile = { ...profile };
        if (convForNewInfo.extractedInfo) {
          Object.entries(convForNewInfo.extractedInfo).forEach(([k,v]) => {
            if (v && v !== "null") mergedProfile[k] = v;
          });
        }
        // Use the user message as the specific query focus
        const result = await searchSchemes(mergedProfile, allSchemes, previousSchemes, userMessage);
        if (result.matches.length > 0) {
          return { statusCode:200, headers, body:JSON.stringify({
            success:true, intent:"search",
            understanding:result.understanding, matches:result.matches,
            totalSchemesAnalyzed:allSchemes.length,
            updatedProfile:mergedProfile, phase:"results"
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

    // Auto-infer problem and gender from situation keywords
    const allText = (userMessage + " " + (updatedProfile.occupation || "") + " " + (updatedProfile.problem || "")).toLowerCase();
    if (!updatedProfile.problem) {
      if (allText.includes("widow") || allText.includes("single parent") || allText.includes("single mother"))
        updatedProfile.problem = "widow single parent financial support";
      else if (allText.includes("unemployed") || allText.includes("no job"))
        updatedProfile.problem = "unemployment support";
      else if (allText.includes("student") || allText.includes("college") || allText.includes("school"))
        updatedProfile.problem = "education support";
      else if (allText.includes("farmer") || allText.includes("farming") || allText.includes("crop"))
        updatedProfile.problem = "agriculture support";
      else if (allText.includes("disabled") || allText.includes("disability"))
        updatedProfile.problem = "disability support";
    }
    // Auto-set gender from situation keywords
    if (!updatedProfile.ageGender || !updatedProfile.ageGender.includes("male")) {
      if (allText.includes("widow") || allText.includes("single mother") || allText.includes("woman") || allText.includes("female")) {
        updatedProfile.ageGender = (updatedProfile.ageGender || "") + " female";
        updatedProfile.ageGender = updatedProfile.ageGender.trim();
      }
    }

    // Smart search trigger: location + any 2 other fields = enough to search
    const filledFields = ['problem','ageGender','location','caste','occupation'].filter(k => updatedProfile[k]);
    const hasLocation = !!updatedProfile.location;
    const shouldSearch = conv.readyToSearch ||
      filledFields.length >= 4 ||
      (hasLocation && filledFields.length >= 3);

    if (shouldSearch) {
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
