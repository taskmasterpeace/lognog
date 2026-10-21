import { useId, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Radio, Send, Volume2, AlertCircle, Loader2 } from 'lucide-react';
import { AlertAction, getRelayStatus } from '../api/client';
import VariableHelper from './VariableHelper';

/**
 * "Studio relay" block in the alert editor: two plain switches that send the
 * alert to Robert through the studio relay (Telegram text with the LogNog logo,
 * and optionally read out on the lab speaker).
 *
 * The relay has no speaker-only path (the lab copy rides along with the
 * Telegram text), so "Say it in the lab" only works with Telegram on.
 *
 * Turning a switch on adds/updates one `relay` action in the rule; turning both
 * off removes it. The relay URL and key stay on the server.
 */

export const RELAY_TEXT_MAX = 1000;
export const RELAY_NOT_SET_UP = "Relay isn't set up on this server (RELAY_URL and RELAY_BUS_KEY).";
export const RELAY_LAB_NOTE = 'Lab announcements ride along with the Telegram text.';
const DEFAULT_MESSAGE = '{{alert_name}}: {{result_count}} results';

/** Same rule as the server: 🚨 urgent, 💰 MONEY, 🎮 GAME, 🚧 otherwise. */
export function relayTag(project: string, urgent: boolean): string {
  if (urgent) return '🚨';
  if (project === 'MONEY') return '💰';
  if (project === 'GAME') return '🎮';
  return '🚧';
}

export function relayPreviewText(project: string, message: string, urgent: boolean): string {
  return `${relayTag(project, urgent)} ${project || 'PROJECT'} · ${message.trim()}`;
}

/** Readable chip label for the alert list ("Telegram + lab"). */
export function relayActionLabel(config: AlertAction['config']): string {
  if (config.telegram && config.lab) return 'Telegram + lab';
  if (config.telegram) return 'Telegram';
  if (config.lab) return 'Lab';
  return 'Studio relay';
}

export function isRelayActionValid(action: AlertAction): boolean {
  const c = action.config || {};
  return Boolean(c.telegram && c.project?.trim() && c.message?.trim());
}

interface Props {
  actions: AlertAction[];
  onChange: (actions: AlertAction[]) => void;
}

function Switch({
  id,
  checked,
  disabled,
  onToggle,
  icon,
  label,
}: {
  id: string;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onToggle}
      className={`w-full min-h-[44px] flex items-center justify-between gap-3 px-3 py-2 rounded-lg border text-left text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-honey-500 ${
        checked
          ? 'border-honey-400 bg-honey-50 dark:bg-honey-900/30 text-honey-800 dark:text-honey-200'
          : 'border-nog-300 dark:border-nog-600 bg-white dark:bg-nog-700 text-nog-800 dark:text-nog-100'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-honey-400'}`}
    >
      <span className="flex items-center gap-2 min-w-0">
        {icon}
        <span>{label}</span>
      </span>
      <span
        aria-hidden="true"
        className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors ${
          checked ? 'bg-honey-500' : 'bg-nog-300 dark:bg-nog-500'
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}

export default function RelayActionEditor({ actions, onChange }: Props) {
  const uid = useId();
  const messageRef = useRef<HTMLTextAreaElement | null>(null);
  const status = useQuery({ queryKey: ['relayStatus'], queryFn: getRelayStatus, staleTime: 60_000 });

  const index = actions.findIndex((a) => a.type === 'relay');
  const existing = index >= 0 ? actions[index] : undefined;

  // Draft keeps the wording while both switches are off, so turning one on again
  // doesn't lose it. The saved action (if any) is the starting point.
  const [draft, setDraft] = useState({
    project: existing?.config.project || '',
    message: existing?.config.message ?? DEFAULT_MESSAGE,
    urgent: Boolean(existing?.config.urgent),
  });

  const telegram = Boolean(existing?.config.telegram);
  const lab = Boolean(existing?.config.lab);
  const configured = status.data?.configured === true;
  const projects = status.data?.projects ?? [];
  const projectOptions = draft.project && !projects.includes(draft.project) ? [draft.project, ...projects] : projects;

  const write = (next: { telegram: boolean; lab: boolean }, fields = draft) => {
    const rest = actions.filter((a) => a.type !== 'relay');
    if (!next.telegram && !next.lab) {
      onChange(rest);
      return;
    }
    const action: AlertAction = {
      type: 'relay',
      config: {
        project: fields.project,
        message: fields.message,
        telegram: next.telegram,
        lab: next.lab,
        urgent: fields.urgent,
      },
    };
    // Keep the relay action where it was so other actions keep their order.
    if (index >= 0) {
      const copy = [...actions];
      copy[index] = action;
      onChange(copy);
    } else {
      onChange([action, ...rest]);
    }
  };

  const updateField = (updates: Partial<typeof draft>) => {
    const fields = { ...draft, ...updates };
    setDraft(fields);
    if (existing) write({ telegram, lab }, fields);
  };

  const insertVariable = (variable: string) => {
    const el = messageRef.current;
    const start = el?.selectionStart ?? draft.message.length;
    const end = el?.selectionEnd ?? draft.message.length;
    updateField({ message: draft.message.slice(0, start) + variable + draft.message.slice(end) });
    setTimeout(() => {
      el?.focus();
      el?.setSelectionRange(start + variable.length, start + variable.length);
    }, 0);
  };

  // Turning Telegram off also turns the lab off: the lab copy can't go alone.
  const toggleTelegram = () => write(telegram ? { telegram: false, lab: false } : { telegram: true, lab });
  const toggleLab = () => write({ telegram, lab: !lab });

  // Not set up: switches can't be turned on (but an existing one can be turned off).
  const telegramDisabled = !configured && !telegram;
  const labDisabled = (!configured && !lab) || (!telegram && !lab);

  const preview = relayPreviewText(draft.project, draft.message, draft.urgent);
  const tooLong = Array.from(preview).length > RELAY_TEXT_MAX;
  const on = telegram || lab;

  return (
    <section
      aria-labelledby={`${uid}-title`}
      className="p-4 rounded-lg border border-honey-200 dark:border-honey-800/60 bg-honey-50/40 dark:bg-nog-700/50 space-y-3"
    >
      <div className="flex items-center gap-2">
        <Radio className="w-4 h-4 text-honey-600 dark:text-honey-400" />
        <h4 id={`${uid}-title`} className="font-medium text-nog-900 dark:text-nog-100">Studio relay</h4>
      </div>

      {status.isLoading && (
        <p className="text-xs text-nog-500 dark:text-nog-400 flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" /> Checking the relay setup…
        </p>
      )}
      {status.isError && (
        <p className="text-xs text-red-600 dark:text-red-400 flex items-start gap-1">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> Couldn't load the relay setup from the server.
        </p>
      )}
      {status.data && !configured && (
        <p className="text-xs text-nog-600 dark:text-nog-300 flex items-start gap-1">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> {RELAY_NOT_SET_UP}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Switch
          id={`${uid}-telegram`}
          checked={telegram}
          disabled={telegramDisabled}
          onToggle={toggleTelegram}
          icon={<Send className="w-4 h-4 flex-shrink-0" />}
          label="Text Robert on Telegram"
        />
        <Switch
          id={`${uid}-lab`}
          checked={lab}
          disabled={labDisabled}
          onToggle={toggleLab}
          icon={<Volume2 className="w-4 h-4 flex-shrink-0" />}
          label="Say it in the lab"
        />
      </div>
      <p className="text-xs text-nog-500 dark:text-nog-400">{RELAY_LAB_NOTE}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${uid}-project`} className="block text-xs font-medium text-nog-700 dark:text-nog-300 mb-1">
            Project
          </label>
          <select
            id={`${uid}-project`}
            value={draft.project}
            onChange={(e) => updateField({ project: e.target.value })}
            className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-nog-700 text-nog-900 dark:text-nog-100 text-sm ${
              on && !draft.project ? 'border-red-400' : 'border-nog-300 dark:border-nog-600'
            }`}
          >
            <option value="">Pick a project…</option>
            {projectOptions.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          {on && !draft.project && <p className="mt-1 text-xs text-red-500">Pick a project for the label.</p>}
        </div>
        <div className="flex items-end">
          <label htmlFor={`${uid}-urgent`} className="flex items-center gap-2 min-h-[40px] text-sm text-nog-700 dark:text-nog-300 cursor-pointer">
            <input
              id={`${uid}-urgent`}
              type="checkbox"
              checked={draft.urgent}
              onChange={(e) => updateField({ urgent: e.target.checked })}
              className="w-4 h-4 rounded border-nog-300 dark:border-nog-600 text-honey-600 focus:ring-honey-500 flex-shrink-0"
            />
            Urgent (can wake him overnight)
          </label>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <label htmlFor={`${uid}-message`} className="block text-xs font-medium text-nog-700 dark:text-nog-300">
            Message (supports variables)
          </label>
          <VariableHelper onInsert={insertVariable} />
        </div>
        <textarea
          id={`${uid}-message`}
          ref={messageRef}
          rows={3}
          value={draft.message}
          onChange={(e) => updateField({ message: e.target.value })}
          placeholder="{{alert_name}}: {{result_count}} errors on {{hostname}}"
          className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-nog-700 text-nog-900 dark:text-nog-100 text-sm font-mono ${
            on && !draft.message.trim() ? 'border-red-400' : 'border-nog-300 dark:border-nog-600'
          }`}
        />
        {on && !draft.message.trim() && <p className="mt-1 text-xs text-red-500">Write the message he should get.</p>}
      </div>

      <div>
        <div className="text-xs font-medium text-nog-700 dark:text-nog-300 mb-1">Preview</div>
        <div className="px-3 py-2 rounded-lg bg-white dark:bg-nog-800 border border-nog-200 dark:border-nog-600 text-sm text-nog-900 dark:text-nog-100 whitespace-pre-wrap break-words">
          {preview}
        </div>
        <p className="mt-1 text-xs text-nog-500 dark:text-nog-400">
          Sent with the LogNog logo. Variables fill in when the alert fires.
          {tooLong && ` Cut to ${RELAY_TEXT_MAX} characters.`}
        </p>
      </div>
    </section>
  );
}
