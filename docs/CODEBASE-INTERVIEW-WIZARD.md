# Codebase Interview Wizard

> **Help your development teams implement logging the right way**

The Codebase Interview Wizard is an AI-powered feature that helps development teams set up proper logging in their applications. It generates customized questionnaires, analyzes responses, and produces implementation guides with actual code.

---

## Table of Contents

1. [Overview](#overview)
2. [How It Works](#how-it-works)
3. [API Reference](#api-reference)
4. [The Questionnaire](#the-questionnaire)
5. [Using Without AI](#using-without-ai)
6. [Best Practices](#best-practices)

---

## Overview

### The Problem

Getting developers to implement proper logging is hard:
- They don't know what to log
- They log too much (performance issues) or too little (debugging blind spots)
- Logs aren't structured (hard to search)
- No correlation between services

### The Solution

The Interview Wizard:
1. **Interviews** your dev team about their application
2. **Analyzes** their responses (with AI or smart defaults)
3. **Generates** customized implementation guides with actual code
4. **Recommends** what logs to capture and how

---

## How It Works

### Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                    YOU (LogNog Admin)                        │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 1: Start Interview Session                             │
│  POST /api/ai/interview/start                                │
│  → Creates session, returns questionnaire                    │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 2: Send Questionnaire to Dev Team                      │
│  (Email, Slack, doc sharing, etc.)                           │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    DEV TEAM                                  │
│  Fills out questionnaire with details about their app        │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 3: Submit Responses                                    │
│  POST /api/ai/interview/:id/respond                          │
│  → AI analyzes, generates follow-up questions                │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 4 (Optional): Submit Follow-up Answers                 │
│  POST /api/ai/interview/:id/follow-up                        │
│  → Adds more context for better recommendations              │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 5: Generate Implementation Guide                       │
│  POST /api/ai/interview/:id/generate                         │
│  → Creates detailed guide with code examples                 │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 6: Share Guide with Dev Team                           │
│  They implement logging, logs flow to LogNog!                │
└─────────────────────────────────────────────────────────────┘
```

---

## API Reference

### Start Interview Session

Creates a new interview session and returns the questionnaire.

```bash
POST /api/ai/interview/start
Content-Type: application/json

{
  "name": "Backend API Logging",
  "app_name": "my-backend-api",
  "team_name": "Platform Team"
}
```

**Response:**
```json
{
  "session": {
    "id": "abc-123",
    "name": "Backend API Logging",
    "status": "questionnaire_sent",
    "current_step": 1
  },
  "questionnaire": "# LogNog Codebase Interview Questionnaire\n\n...",
  "message": "Interview session created. Send the questionnaire to your development team.",
  "next_step": "Submit their responses using POST /api/ai/interview/:id/respond"
}
```

### Get Questionnaire

Retrieve the questionnaire for a session (to re-send to team).

```bash
GET /api/ai/interview/:id/questionnaire
```

**Response:**
```json
{
  "session_id": "abc-123",
  "session_name": "Backend API Logging",
  "questionnaire": "# LogNog Codebase Interview Questionnaire\n\n...",
  "status": "questionnaire_sent"
}
```

### Submit Responses

Submit the dev team's filled-out questionnaire.

```bash
POST /api/ai/interview/:id/respond
Content-Type: application/json

{
  "responses": "# LogNog Codebase Interview Questionnaire\n\n## 1. Application Overview\n\n**1.1 What is the name of your application?**\n> MyApp Backend API\n\n**1.2 What does your application do?**\n> E-commerce order processing...\n\n..."
}
```

**Response:**
```json
{
  "session": { ... },
  "follow_up_questions": "# Follow-up Questions\n\n1. **Entry Points**: What are the main entry points...",
  "preliminary_recommendations": {
    "critical_logs": ["Order creation", "Payment processing"],
    "security_logs": ["Authentication attempts", "Authorization failures"],
    "performance_logs": ["API response times", "Database queries"],
    "error_logs": ["Payment failures", "Inventory sync errors"],
    "business_logs": ["Checkout funnel events", "Cart abandonment"]
  },
  "message": "Responses received. Review the follow-up questions and preliminary recommendations.",
  "next_step": "Submit follow-up answers OR generate implementation guide",
  "ai_available": true
}
```

### Submit Follow-up Answers (Optional)

Add more context from follow-up questions.

```bash
POST /api/ai/interview/:id/follow-up
Content-Type: application/json

{
  "follow_up_answers": "## Entry Points\n\nMain routes:\n- POST /orders - Order creation\n- POST /payments - Payment processing\n- GET /inventory - Stock checks\n\n..."
}
```

### Generate Implementation Guide

Generate the final implementation guide with code.

```bash
POST /api/ai/interview/:id/generate
```

**Response:**
```json
{
  "session": { ... },
  "implementation_guide": "# Logging Implementation Guide\n\n## 1. Logging Setup (Node.js)\n\n```javascript\n// Install: npm install pino\n...\n```",
  "message": "Implementation guide generated! Share this with your development team.",
  "ai_available": true
}
```

### List All Sessions

```bash
GET /api/ai/interview
```

### Get Session Details

```bash
GET /api/ai/interview/:id
```

### Mark Session Complete

```bash
POST /api/ai/interview/:id/complete
```

### Delete Session

```bash
DELETE /api/ai/interview/:id
```

---

## The Questionnaire

The questionnaire covers 7 key areas:

### 1. Application Overview
- Application name and description
- Programming languages and frameworks

### 2. Architecture
- Monolith vs microservices vs serverless
- Databases used
- Message queues
- External integrations

### 3. Current Logging
- Existing logging setup
- Logging libraries in use
- Where logs currently go

### 4. Critical Paths
- Most important user operations
- Money/compliance-sensitive operations
- Common issues and errors

### 5. Infrastructure
- Deployment environment (Docker, K8s, bare metal)
- Deployment process
- Scaling/replicas

### 6. Monitoring Goals
- Problems logging should solve
- Key metrics to track
- Alerting requirements

### 7. Team & Process
- Team size
- Who reviews logs

---

## Using Without AI (Ollama)

The Interview Wizard works **with or without Ollama**:

### With Ollama (Recommended)
- AI generates contextual follow-up questions
- AI creates customized implementation guides
- Recommendations are specific to tech stack

### Without Ollama
- Uses smart defaults based on keyword detection
- Generates comprehensive but generic guides
- Still detects Node.js, Python, Docker, etc.

### Setting Up Ollama

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull a model
ollama pull llama3.2

# Start Ollama
ollama serve
```

**Environment Variables:**
```bash
# API will use these (defaults shown)
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
```

### Check AI Status

```bash
GET /api/ai/status
```

```json
{
  "available": true,
  "url": "http://localhost:11434",
  "model": "llama3.2",
  "availableModels": ["llama3.2", "codellama"]
}
```

---

## Best Practices

### For LogNog Admins

1. **Start early** - Begin the interview process before the dev team starts building
2. **Follow up** - If responses are vague, ask for clarification
3. **Review recommendations** - AI suggestions are starting points, not gospel
4. **Iterate** - Run multiple sessions as the app evolves

### For Development Teams

1. **Be detailed** - More context = better recommendations
2. **List all integrations** - Don't forget third-party APIs
3. **Describe error patterns** - What goes wrong and how often?
4. **Share examples** - Include sample log output if you have any

### Generated Guide Quality

The implementation guide quality depends on:

| Factor | Impact |
|--------|--------|
| Response detail | More detail = more specific code |
| Tech stack clarity | Named frameworks get specific examples |
| AI availability | Ollama enables context-aware generation |
| Follow-up answers | Additional context improves targeting |

---

## Example Session

### 1. Start Session

```bash
curl -X POST http://localhost:4000/api/ai/interview/start \
  -H "Content-Type: application/json" \
  -d '{"name": "Order Service", "app_name": "order-service", "team_name": "Commerce"}'
```

### 2. Get Questionnaire and Send to Team

```bash
curl http://localhost:4000/api/ai/interview/SESSION_ID/questionnaire
```

Copy the markdown questionnaire and send to your dev team via email, Slack, or your preferred channel.

### 3. Submit Their Responses

```bash
curl -X POST http://localhost:4000/api/ai/interview/SESSION_ID/respond \
  -H "Content-Type: application/json" \
  -d '{"responses": "THEIR FILLED OUT QUESTIONNAIRE HERE"}'
```

### 4. Generate Implementation Guide

```bash
curl -X POST http://localhost:4000/api/ai/interview/SESSION_ID/generate
```

### 5. Share the Guide

The response contains a full implementation guide in markdown. Share it with your dev team!

---

## What Logs Should You Capture?

The wizard recommends logs in these categories:

| Category | Examples |
|----------|----------|
| **Critical** | App startup, config loading, transactions |
| **Security** | Auth attempts, authorization, API key usage |
| **Performance** | Response times, DB queries, external calls |
| **Errors** | Exceptions, validation, connection failures |
| **Business** | User actions, conversions, feature usage |

### Sample Log Format

```json
{
  "timestamp": "2025-01-15T10:30:00.000Z",
  "level": "info",
  "service": "order-service",
  "environment": "production",
  "hostname": "order-01",
  "trace_id": "abc-123-xyz",
  "message": "Order created",
  "context": {
    "order_id": "ORD-12345",
    "user_id": "USR-67890",
    "total": 99.99,
    "items": 3
  }
}
```

---

## Integration with LogNog

After implementing logging, teams can ship logs to LogNog via:

1. **LogNog In Agent** - Best for servers/VMs
2. **HTTP Ingestion** - Best for serverless/cloud
3. **Syslog** - Best for Docker/Linux systems

See the implementation guide for specific instructions for each method.

---

*Help your teams log smarter, not harder.*
