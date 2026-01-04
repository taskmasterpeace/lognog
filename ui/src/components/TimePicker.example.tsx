/**
 * TimePicker Component Usage Example
 *
 * This file demonstrates how to use the TimePicker component in your application.
 */

import { useState } from 'react';
import TimePicker from './TimePicker';

export default function TimePickerExample() {
  const [timeRange, setTimeRange] = useState<{ earliest: string; latest?: string }>({
    earliest: '-24h',
    latest: undefined
  });

  const handleRangeChange = (earliest: string, latest?: string) => {
    console.log('Time range changed:', { earliest, latest });
    setTimeRange({ earliest, latest });
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">TimePicker Component</h2>
        <p className="text-slate-600 text-sm">
          Select a time range using presets or custom date/time picker
        </p>
      </div>

      {/* TimePicker Component */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-slate-700">Time Range:</label>
        <TimePicker
          onRangeChange={handleRangeChange}
          defaultRange="-24h"
        />
      </div>

      {/* Display Current Selection */}
      <div className="card p-4 bg-slate-50">
        <p className="text-sm font-medium text-slate-900 mb-2">Current Selection:</p>
        <div className="space-y-1">
          <p className="text-sm text-slate-700">
            <span className="font-semibold">Earliest:</span>{' '}
            <code className="code">{timeRange.earliest || '(all time)'}</code>
          </p>
          {timeRange.latest && (
            <p className="text-sm text-slate-700">
              <span className="font-semibold">Latest:</span>{' '}
              <code className="code">{timeRange.latest}</code>
            </p>
          )}
        </div>
      </div>

      {/* Usage Instructions */}
      <div className="card p-4">
        <h3 className="font-semibold text-slate-900 mb-3">Usage</h3>
        <pre className="text-xs bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto">
{`import TimePicker from './components/TimePicker';

function MyComponent() {
  const handleRangeChange = (earliest: string, latest?: string) => {
    console.log('Time range:', { earliest, latest });
    // earliest can be:
    //   - Relative: "-5m", "-15m", "-30m", "-1h", "-4h", "-12h", "-24h", "-7d", "-30d"
    //   - ISO date: "2024-01-15T10:30:00.000Z"
    //   - Empty string: "" (all time)
    // latest is optional, only present for custom ranges (ISO date)
  };

  return (
    <TimePicker
      onRangeChange={handleRangeChange}
      defaultRange="-24h"
    />
  );
}`}
        </pre>
      </div>

      {/* Props Documentation */}
      <div className="card p-4">
        <h3 className="font-semibold text-slate-900 mb-3">Props</h3>
        <table className="table text-xs">
          <thead>
            <tr>
              <th>Prop</th>
              <th>Type</th>
              <th>Required</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code className="code">onRangeChange</code></td>
              <td><code className="text-xs">(earliest: string, latest?: string) =&gt; void</code></td>
              <td><span className="badge badge-error">Yes</span></td>
              <td>Callback when time range changes</td>
            </tr>
            <tr>
              <td><code className="code">defaultRange</code></td>
              <td><code className="text-xs">string</code></td>
              <td><span className="badge badge-info">No</span></td>
              <td>Default time range (default: "-24h")</td>
            </tr>
            <tr>
              <td><code className="code">className</code></td>
              <td><code className="text-xs">string</code></td>
              <td><span className="badge badge-info">No</span></td>
              <td>Additional CSS classes</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Available Presets */}
      <div className="card p-4">
        <h3 className="font-semibold text-slate-900 mb-3">Available Presets</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
          {[
            'Last 5 minutes',
            'Last 15 minutes',
            'Last 30 minutes',
            'Last 1 hour',
            'Last 4 hours',
            'Last 12 hours',
            'Last 24 hours',
            'Last 7 days',
            'Last 30 days',
            'All time',
            'Custom range',
          ].map(preset => (
            <div key={preset} className="flex items-center gap-2 text-slate-700">
              <div className="w-1.5 h-1.5 bg-amber-500 rounded-full"></div>
              {preset}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
