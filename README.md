# NILAI — AI-Powered Government Scheme Discovery Chatbot

> **நிலை** means *Value* in Tamil.

NILAI is a conversational AI chatbot that helps Indian citizens discover government welfare schemes they are eligible for — built entirely on AWS for the **AWS AI for Bharat Hackathon 2026**.

**Team FemBytes | Team Leader: Monija V**

---

## 🚀 Live Demo

🌐 **Live App:** https://main.d2ncf3r3x7248a.amplifyapp.com

🎥 **Demo Video:** https://drive.google.com/file/d/1JXFOtL13E6saWBNj7TTwm5Dw2GxhJsNB/view?usp=sharing

---

## 🎯 Problem Statement

A widow in Tamil Nadu, a farmer in Coimbatore, a student who cannot pay college fees — all of them qualify for life-changing government schemes worth thousands of rupees. But they never apply because they simply do not know these schemes exist. NILAI changes that.

India has over 3,400 central and state government schemes but most citizens — especially rural, low-income, and marginalized communities — never access them because discovering eligibility requires navigating hundreds of complex portals. NILAI bridges this gap using conversational AI.

---

## 💡 Solution

NILAI works like WhatsApp. You just chat naturally:

> *"I am a 20 year old OBC student from Coimbatore Tamil Nadu, my family income is 3000 per month"*

NILAI instantly finds the top government schemes you qualify for — with eligibility explanation, documents needed, and direct apply links.

---

## 🏗️ Architecture

```
User Message
      ↓
React Frontend (AWS Amplify)
      ↓
REST API — POST /prod/search (Amazon API Gateway)
      ↓
AWS Lambda — nilai-search-schemes (Node.js 18)
      ├── Step 1: handleConversation()    — Extract user info via Bedrock
      ├── Step 2: hardFilterSchemes()     — Code-level filter (state/age/income)
      ├── Step 3: smartPreFilter()        — Keyword scoring, Top 40
      ├── Step 4: Bedrock Nova Lite       — AI ranks best 3-5 schemes
      └── Step 5: Return structured JSON
      ↓
Amazon DynamoDB — nilai-schemes table
      ↓
Amazon Bedrock — Nova Lite (apac.amazon.nova-lite-v1:0)
```

**Region:** ap-south-1 (Mumbai, India)

---

## ⚙️ AWS Services Used

| Service | Purpose |
|---------|---------|
| AWS Amplify | Host React.js frontend |
| Amazon API Gateway | REST API endpoint POST /prod/search |
| AWS Lambda | Serverless backend — Node.js 18, 512MB, 60s timeout |
| Amazon DynamoDB | Store 101 curated TN + Central government schemes |
| Amazon Bedrock | Nova Lite model for NLU and scheme ranking |
| AWS IAM | Lambda permissions for Bedrock and DynamoDB |

---

## 🧠 How It Works

### 5-Step Filtering Pipeline

**Step 1 — Conversation Manager**
Amazon Bedrock Nova Lite extracts age, gender, location, caste, occupation, and income from natural language messages. Collects profile across max 3 conversation turns then auto-searches.

**Step 2 — Hard Filter (Deterministic)**
Code-level filter removes schemes that don't match:
- Wrong state (Tamil Nadu users only see TN + Central schemes)
- Wrong age range
- Wrong gender
- Income above eligibility limit

**Step 3 — Smart Pre-Filter**
Keyword relevance scoring ranks remaining schemes by problem match, category match, and tag match. Top 40 selected.

**Step 4 — AI Ranking**
Amazon Bedrock Nova Lite picks the best 3-5 schemes from the top 40 and generates a personal eligibility explanation for each user.

**Step 5 — Results**
Scheme cards returned with name, benefit amount, why you qualify, documents needed, application steps, and official apply link.

---

## 📁 Project Structure

```
nilai-prototype/
├── backend/
│   └── lambda/
│       └── searchSchemes/
│           ├── index.js          ← Main Lambda function (5-step pipeline)
│           └── package.json
├── frontend/
│   └── nilai-ui/
│       ├── src/
│       │   ├── App.js            ← React chat interface
│       │   ├── index.js
│       │   └── index.css
│       └── public/
├── .gitignore
└── README.md
```

---

## 🚀 Local Setup

### Prerequisites
- Node.js 18+
- AWS CLI configured with ap-south-1 region
- AWS account with Bedrock Nova Lite access

### Backend — Deploy Lambda

```bash
cd backend/lambda/searchSchemes
npm install
zip -r ../../../nilai-lambda.zip . --quiet
aws lambda update-function-code \
  --function-name nilai-search-schemes \
  --zip-file fileb://nilai-lambda.zip \
  --region ap-south-1
```

### Frontend — Run Locally

```bash
cd frontend/nilai-ui
npm install
npm start
```

App runs at http://localhost:3000

### Frontend — Deploy to Amplify

```bash
cd frontend/nilai-ui
npm run build
# Push to GitHub → Amplify auto-deploys
```

---

## 🗄️ Database

**Table:** `nilai-schemes` (DynamoDB, ap-south-1)

**101 curated schemes:**
- 51 Tamil Nadu specific schemes
- 50 Central Government schemes (valid for all states)

**Categories:** Education (32), Social Welfare (19), Women (12), Employment (9), Health (9), Finance (8), Agriculture (5), Housing (4), Insurance (3)

---

## 💬 Example Conversations

**Student looking for scholarships:**
```
User: I am a 20 year old OBC student from Chennai Tamil Nadu income 3000
NILAI: Found top 3 education scholarships for you...
       #1 PM-USP Scholarship — ₹10,000/year
       #2 OBC Post-Matric Scholarship — ₹750/month
       #3 Free Education Scholarship TN — Full tuition
```

**Widow needing support:**
```
User: I am a widow from Coimbatore with 2 children income 2000
NILAI: Found top 3 schemes for widows...
       #1 Destitute Widow Pension Scheme — ₹1,000/month
       #2 Indira Gandhi National Widow Pension — ₹300/month
       #3 Marriage Assistance for Daughter of Poor Widow
```

**Follow-up questions:**
```
User: Tell me the eligibility for the first scheme
NILAI: Explains eligibility in simple language...

User: What documents do I need?
NILAI: Lists all required documents...

User: How do I apply?
NILAI: Step-by-step application process...
```

---

## 🔮 Future Roadmap

- **Phase 2:** Add Tamil and Hindi voice input
- **Phase 3:** Expand to all 28 Indian states (3,400+ schemes)
- **Phase 4:** AI Intent Router — dedicated Bedrock call for intent classification
- **Phase 5:** WhatsApp integration for rural users without smartphones
- **Phase 6:** Offline support via SMS for areas with no internet

---

## 🏆 Social Impact

NILAI targets ₹1,000+ crore in unclaimed government benefits, putting life-changing welfare directly into the hands of:
- 👩 Widows and single mothers
- 👨‍🌾 Farmers and agricultural workers
- 🎓 Students who cannot afford college fees
- ♿ Differently-abled persons
- 👴 Senior citizens
- 💼 Unemployed youth

---

## 🛠️ Tech Stack

- **Frontend:** React.js, CSS3
- **Backend:** Node.js 18, AWS Lambda
- **AI:** Amazon Bedrock — Nova Lite
- **Database:** Amazon DynamoDB
- **API:** Amazon API Gateway
- **Hosting:** AWS Amplify
- **Region:** ap-south-1 Mumbai India

---

*Built with ❤️ by Team FemBytes — AWS AI for Bharat Hackathon 2026*
