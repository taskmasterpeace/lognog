/**
 * Every API router and the path it mounts at, in one place.
 *
 * index.ts mounts these on the real server; the API-key permission coverage
 * test (apikey-permission-coverage.test.ts) mounts the SAME list, so a router
 * added here is automatically walked by that test. The API-key gate
 * (auth/api-key-gate.ts) runs in front of all of them.
 */
import type { Application } from 'express';
import { apiKeyGate } from '../auth/api-key-gate.js';
import searchRouter from './search.js';
import dashboardsRouter from './dashboards.js';
import projectsRouter from './projects.js';
import statsRouter from './stats.js';
import statusRouter from './status.js';
import reportsRouter from './reports.js';
import knowledgeRouter from './knowledge.js';
import fieldExtractionsRouter from './field-extractions.js';
import authRouter from './auth.js';
import ingestRouter from './ingest.js';
import alertsRouter from './alerts.js';
import geoipRouter from './geoip.js';
import silencesRouter from './silences.js';
import utilsRouter from './utils.js';
import templatesRouter from './templates.js';
import aiRouter from './ai.js';
import demoRouter from './demo.js';
import mcpRouter from './mcp.js';
import agentRouter from './agent.js';
import notificationsRouter from './notifications.js';
import settingsRouter from './settings.js';
import onboardingRouter from './onboarding.js';
import anomalyRouter from './anomaly.js';
import assetsRouter from './assets.js';
import identitiesRouter from './identities.js';
import cimRouter from './cim.js';
import attackRouter from './attack.js';
import macrosRouter from './macros.js';
import eventAnnotationsRouter from './event-annotations.js';
import syntheticRouter from './synthetic.js';
import savedSearchesRouter from './saved-searches.js';
import sourceAnnotationsRouter from './source-annotations.js';
import retentionRouter from './retention.js';
import dslRouter from './dsl.js';
import sourceConfigsRouter from './source-configs.js';
import routingRulesRouter from './routing-rules.js';
import sourcesRouter from './sources.js';
import pullCollectorsRouter from './pull-collectors.js';

export const API_ROUTERS = [
  ['/auth', authRouter],
  ['/ingest', ingestRouter],
  ['/search', searchRouter],
  ['/dashboards', dashboardsRouter],
  ['/projects', projectsRouter],
  ['/stats', statsRouter],
  ['/status', statusRouter],
  ['/reports', reportsRouter],
  ['/knowledge', knowledgeRouter],
  ['/field-extractions', fieldExtractionsRouter],
  ['/alerts', alertsRouter],
  ['/silences', silencesRouter],
  ['/geoip', geoipRouter],
  ['/utils', utilsRouter],
  ['/templates', templatesRouter],
  ['/ai', aiRouter],
  ['/agent', agentRouter],
  ['/demo', demoRouter],
  ['/mcp', mcpRouter],
  ['/notifications', notificationsRouter],
  ['/settings', settingsRouter],
  ['/onboarding', onboardingRouter],
  ['/anomaly', anomalyRouter],
  ['/assets', assetsRouter],
  ['/identities', identitiesRouter],
  ['/cim', cimRouter],
  ['/attack', attackRouter],
  ['/macros', macrosRouter],
  ['/event-annotations', eventAnnotationsRouter],
  ['/synthetic', syntheticRouter],
  ['/saved-searches', savedSearchesRouter],
  ['/source-annotations', sourceAnnotationsRouter],
  ['/retention', retentionRouter],
  ['/dsl', dslRouter],
  ['/source-configs', sourceConfigsRouter],
  ['/routing-rules', routingRulesRouter],
  ['/sources', sourcesRouter],
  ['/pull-collectors', pullCollectorsRouter],
] as const;

/** Mount the API-key gate and every API router on `app`. */
export function mountApiRoutes(app: Application): void {
  // Checks every `Authorization: ApiKey` / `X-API-Key` request against the
  // key's own permissions before any router sees it (the key lock).
  app.use(apiKeyGate);
  for (const [path, router] of API_ROUTERS) {
    app.use(path, router);
  }
}
