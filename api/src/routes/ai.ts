import { Router } from 'express';
import { authenticate, rateLimit } from '../auth/middleware.js';
import dslGeneration from './ai/dsl-generation.js';
import insights from './ai/insights.js';
import interview from './ai/interview.js';
import rag from './ai/rag.js';
import llamaindex from './ai/llamaindex.js';
import assistant from './ai/assistant.js';
import nogchat from './ai/nogchat.js';
import agents from './ai/agents.js';
import errorDiagnosis from './ai/error-diagnosis.js';
import helpbot from './ai/helpbot.js';
import aiContext from './ai/context.js';

const router = Router();

// Every AI route runs LLM calls that hit Ollama or the paid OpenRouter key and
// can read/write log-derived context, so the whole surface requires auth, and a
// rate limit caps runaway spend/abuse. (helpbot/context also apply their own
// auth; running it again here is harmless.)
router.use(authenticate);
router.use(rateLimit(60, 60000));

router.use('/', dslGeneration);
router.use('/', insights);
router.use('/', interview);
router.use('/', rag);
router.use('/', llamaindex);
router.use('/', assistant);
router.use('/', nogchat);
router.use('/', agents);
router.use('/', errorDiagnosis);
router.use('/', helpbot);
router.use('/', aiContext);

export default router;
