/**
 * Synthetic Test Scheduler
 *
 * Schedules and runs synthetic tests based on cron expressions.
 */

import * as cron from 'node-cron';
import { getSyntheticTests, updateSyntheticTestStatus } from '../../db/sqlite.js';
import { runTest } from './runner.js';

interface ScheduledTest {
  testId: string;
  task: cron.ScheduledTask;
}

// Map of test ID to scheduled task
const scheduledTests = new Map<string, ScheduledTest>();

// Flag to track if scheduler is running
let isRunning = false;

/**
 * Start the scheduler - loads all enabled tests and schedules them
 */
export function startScheduler(): void {
  if (isRunning) {
    console.log('[Synthetic] Scheduler already running');
    return;
  }

  console.log('[Synthetic] Starting scheduler...');
  isRunning = true;

  // Load and schedule all enabled tests
  const tests = getSyntheticTests({ enabled: true });
  let scheduled = 0;

  for (const test of tests) {
    try {
      scheduleTest(test.id, test.schedule);
      scheduled++;
    } catch (error) {
      console.error(
        `[Synthetic] Failed to schedule test ${test.id}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  console.log(`[Synthetic] Scheduler started - ${scheduled} tests scheduled`);
}

/**
 * Stop the scheduler - cancels all scheduled tasks
 */
export function stopScheduler(): void {
  if (!isRunning) {
    return;
  }

  console.log('[Synthetic] Stopping scheduler...');

  for (const [testId, scheduled] of scheduledTests) {
    scheduled.task.stop();
    console.log(`[Synthetic] Stopped task for test ${testId}`);
  }

  scheduledTests.clear();
  isRunning = false;

  console.log('[Synthetic] Scheduler stopped');
}

/**
 * Schedule a single test with a cron expression
 */
export function scheduleTest(testId: string, cronExpression: string): void {
  // Validate cron expression
  if (!cron.validate(cronExpression)) {
    throw new Error(`Invalid cron expression: ${cronExpression}`);
  }

  // Stop existing schedule if any
  unscheduleTest(testId);

  // Create new scheduled task
  const task = cron.schedule(cronExpression, async () => {
    console.log(`[Synthetic] Running scheduled test: ${testId}`);
    try {
      const result = await runTest(testId);
      console.log(
        `[Synthetic] Test ${testId} completed: ${result.status} (${result.response_time_ms}ms)`
      );

      // Update last run info on the test
      updateSyntheticTestStatus(testId, result.status, result.response_time_ms);
    } catch (error) {
      console.error(
        `[Synthetic] Test ${testId} failed:`,
        error instanceof Error ? error.message : error
      );
    }
  });

  scheduledTests.set(testId, { testId, task });
  console.log(`[Synthetic] Scheduled test ${testId} with cron: ${cronExpression}`);
}

/**
 * Unschedule a test
 */
export function unscheduleTest(testId: string): void {
  const scheduled = scheduledTests.get(testId);
  if (scheduled) {
    scheduled.task.stop();
    scheduledTests.delete(testId);
    console.log(`[Synthetic] Unscheduled test ${testId}`);
  }
}

/**
 * Reschedule a test (useful after schedule changes)
 */
export function rescheduleTest(testId: string, newCronExpression: string): void {
  scheduleTest(testId, newCronExpression);
}

/**
 * Get status of the scheduler
 */
export function getSchedulerStatus(): {
  running: boolean;
  scheduledCount: number;
  tests: Array<{ testId: string; scheduled: boolean }>;
} {
  const allTests = getSyntheticTests({ enabled: true });

  return {
    running: isRunning,
    scheduledCount: scheduledTests.size,
    tests: allTests.map((test) => ({
      testId: test.id,
      scheduled: scheduledTests.has(test.id),
    })),
  };
}

/**
 * Run a test immediately (manual trigger)
 */
export async function runTestNow(
  testId: string
): Promise<{ status: string; response_time_ms: number; error_message?: string }> {
  console.log(`[Synthetic] Manual run triggered for test: ${testId}`);

  const result = await runTest(testId);

  // Update last run info
  updateSyntheticTestStatus(testId, result.status, result.response_time_ms);

  return {
    status: result.status,
    response_time_ms: result.response_time_ms,
    error_message: result.error_message,
  };
}

/**
 * Refresh scheduler - reload all tests from database
 */
export function refreshScheduler(): void {
  if (!isRunning) {
    startScheduler();
    return;
  }

  console.log('[Synthetic] Refreshing scheduler...');

  // Get current enabled tests
  const enabledTests = getSyntheticTests({ enabled: true });
  const enabledIds = new Set(enabledTests.map((t) => t.id));

  // Remove tests that are no longer enabled
  for (const [testId] of scheduledTests) {
    if (!enabledIds.has(testId)) {
      unscheduleTest(testId);
    }
  }

  // Add/update enabled tests
  for (const test of enabledTests) {
    const existing = scheduledTests.get(test.id);
    if (!existing) {
      // New test - schedule it
      try {
        scheduleTest(test.id, test.schedule);
      } catch (error) {
        console.error(
          `[Synthetic] Failed to schedule test ${test.id}:`,
          error instanceof Error ? error.message : error
        );
      }
    }
  }

  console.log('[Synthetic] Scheduler refreshed');
}
