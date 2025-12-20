/**
 * Tooltip Demo Page
 *
 * This page demonstrates all tooltip variants and usage patterns.
 * Navigate to /tooltip-demo to see this page.
 */

import { Tooltip, TooltipWithCode } from '../components/ui/Tooltip';
import { InfoTip, InfoIcon } from '../components/ui/InfoTip';
import { Code, Database, Zap, Settings } from 'lucide-react';

export default function TooltipDemo() {
  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">
          Tooltip Demo
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Interactive examples of all tooltip variants in LogNog
        </p>
      </div>

      <div className="space-y-12">
        {/* Basic Tooltip */}
        <section className="card p-6">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">
            Basic Tooltip
          </h2>
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Simple tooltips that appear on hover/focus with automatic positioning.
            </p>
            <div className="flex flex-wrap gap-4">
              <Tooltip content="This appears on top" placement="top">
                <button className="btn-primary">Top</button>
              </Tooltip>
              <Tooltip content="This appears on the right" placement="right">
                <button className="btn-primary">Right</button>
              </Tooltip>
              <Tooltip content="This appears on bottom" placement="bottom">
                <button className="btn-primary">Bottom</button>
              </Tooltip>
              <Tooltip content="This appears on the left" placement="left">
                <button className="btn-primary">Left</button>
              </Tooltip>
            </div>
          </div>
        </section>

        {/* Tooltip with Code */}
        <section className="card p-6">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">
            Tooltip with Code Examples
          </h2>
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Tooltips that include code snippets for technical guidance.
            </p>
            <TooltipWithCode
              content={
                <div>
                  <p className="font-semibold mb-1">DSL Query Syntax</p>
                  <p className="text-xs">Use pipes to chain commands together</p>
                </div>
              }
              code={`search severity<=3
search host=web* | stats count by app_name
search error | timechart span=1h count`}
              placement="bottom"
            >
              <input
                type="text"
                placeholder="Hover to see query examples"
                className="input max-w-md"
                readOnly
              />
            </TooltipWithCode>
          </div>
        </section>

        {/* InfoTip */}
        <section className="card p-6">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">
            InfoTip (?) Icon
          </h2>
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Small (?) icon for inline help on form fields.
            </p>
            <div className="space-y-4 max-w-md">
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Alert Threshold
                  <InfoTip
                    content="Number of log events that must occur before this alert triggers"
                    placement="right"
                  />
                </label>
                <input type="number" className="input" defaultValue={10} />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Time Range
                  <InfoTip
                    content="How far back to search when the alert runs"
                    placement="right"
                  />
                </label>
                <select className="input">
                  <option>Last 5 minutes</option>
                  <option>Last 15 minutes</option>
                  <option>Last hour</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        {/* InfoIcon */}
        <section className="card p-6">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">
            InfoIcon (i) Alternative
          </h2>
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Alternative help icon using circle-i style.
            </p>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100">
                Dashboard Settings
              </h3>
              <InfoIcon
                content="Configure panel refresh intervals, time ranges, and variables"
                placement="right"
              />
            </div>
          </div>
        </section>

        {/* Rich Content Tooltips */}
        <section className="card p-6">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">
            Rich Content Tooltips
          </h2>
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Tooltips with structured, multi-part content.
            </p>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Trigger Type
              </label>
              <InfoTip
                content={
                  <div className="space-y-2">
                    <p className="font-semibold">Available Trigger Types</p>
                    <div className="space-y-1 text-xs">
                      <p><strong>Number of Results:</strong> Count of matching logs</p>
                      <p><strong>Number of Hosts:</strong> Count of unique hostnames</p>
                      <p><strong>Custom:</strong> Any match triggers alert</p>
                    </div>
                  </div>
                }
                placement="right"
              />
            </div>
          </div>
        </section>

        {/* Icon Buttons with Tooltips */}
        <section className="card p-6">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">
            Icon Buttons with Tooltips
          </h2>
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Hover over icon buttons to see their actions.
            </p>
            <div className="flex gap-2">
              <Tooltip content="View query syntax" placement="bottom">
                <button className="p-3 rounded-lg border-2 border-slate-200 dark:border-slate-700 hover:border-sky-500 transition-colors">
                  <Code className="w-5 h-5" />
                </button>
              </Tooltip>
              <Tooltip content="Database settings" placement="bottom">
                <button className="p-3 rounded-lg border-2 border-slate-200 dark:border-slate-700 hover:border-sky-500 transition-colors">
                  <Database className="w-5 h-5" />
                </button>
              </Tooltip>
              <Tooltip content="Performance optimization" placement="bottom">
                <button className="p-3 rounded-lg border-2 border-slate-200 dark:border-slate-700 hover:border-sky-500 transition-colors">
                  <Zap className="w-5 h-5" />
                </button>
              </Tooltip>
              <Tooltip content="Configuration options" placement="bottom">
                <button className="p-3 rounded-lg border-2 border-slate-200 dark:border-slate-700 hover:border-sky-500 transition-colors">
                  <Settings className="w-5 h-5" />
                </button>
              </Tooltip>
            </div>
          </div>
        </section>

        {/* Long Content Example */}
        <section className="card p-6">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">
            Custom Width Tooltip
          </h2>
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Tooltips with longer content and custom max-width.
            </p>
            <Tooltip
              content="This is a longer explanation that demonstrates how tooltips can handle more extensive content. The max-width is automatically managed to ensure readability while preventing the tooltip from becoming too wide."
              placement="top"
              maxWidth={400}
            >
              <button className="btn-secondary">
                Hover for longer explanation
              </button>
            </Tooltip>
          </div>
        </section>

        {/* Theme Showcase */}
        <section className="card p-6">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">
            Theme Compatibility
          </h2>
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              All tooltips automatically adapt to light and dark themes. Toggle your theme to see the difference!
            </p>
            <div className="flex gap-4">
              <Tooltip content="I adapt to your theme!" placement="top">
                <button className="btn-primary">Test Theme</button>
              </Tooltip>
            </div>
          </div>
        </section>

        {/* Usage Notes */}
        <section className="bg-sky-50 dark:bg-sky-900/20 rounded-xl p-6 border border-sky-200 dark:border-sky-800">
          <h3 className="font-semibold text-sky-900 dark:text-sky-100 mb-2">
            Implementation Notes
          </h3>
          <ul className="space-y-2 text-sm text-sky-800 dark:text-sky-200">
            <li>✓ All tooltips use @floating-ui/react for smart positioning</li>
            <li>✓ Tooltips automatically flip/shift to stay in viewport</li>
            <li>✓ Smooth 200ms fade-in animation</li>
            <li>✓ Works with keyboard focus (Tab key)</li>
            <li>✓ Touch-friendly on mobile devices</li>
            <li>✓ Accessible with proper ARIA attributes</li>
            <li>✓ Theme-aware styling (light/dark mode)</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
