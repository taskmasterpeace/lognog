import { Router } from 'express';
import dslGeneration from './ai/dsl-generation.js';
import insights from './ai/insights.js';
import interview from './ai/interview.js';
import rag from './ai/rag.js';
import llamaindex from './ai/llamaindex.js';
import assistant from './ai/assistant.js';
import nogchat from './ai/nogchat.js';
import agents from './ai/agents.js';
import errorDiagnosis from './ai/error-diagnosis.js';

const router = Router();

router.use('/', dslGeneration);
router.use('/', insights);
router.use('/', interview);
router.use('/', rag);
router.use('/', llamaindex);
router.use('/', assistant);
router.use('/', nogchat);
router.use('/', agents);
router.use('/', errorDiagnosis);

export default router;
