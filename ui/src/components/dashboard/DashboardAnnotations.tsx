import { useState } from 'react';
import { MessageSquarePlus, X, Trash2, Calendar, User } from 'lucide-react';

export interface Annotation {
  id: string;
  timestamp: string;
  title: string;
  description?: string;
  color: string;
  created_by?: string;
  created_at: string;
}

interface DashboardAnnotationsProps {
  annotations: Annotation[];
  editMode: boolean;
  onAdd?: (annotation: Omit<Annotation, 'id' | 'created_at'>) => void;
  onDelete?: (id: string) => void;
}

export function DashboardAnnotations({
  annotations,
  editMode,
  onAdd,
  onDelete,
}: DashboardAnnotationsProps) {
  const [showAddForm, setShowAddForm] = useState(false);

  if (annotations.length === 0 && !editMode) {
    return null;
  }

  return (
    <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-700 bg-amber-50/50 dark:bg-amber-900/10">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1">
          <MessageSquarePlus className="w-4 h-4" />
          Annotations ({annotations.length})
        </span>
        {editMode && onAdd && (
          <button
            onClick={() => setShowAddForm(true)}
            className="text-sm text-amber-600 hover:text-amber-700 dark:text-amber-400"
          >
            + Add
          </button>
        )}
      </div>

      {/* Annotation list */}
      <div className="flex flex-wrap gap-2">
        {annotations.map((annotation) => (
          <AnnotationBadge
            key={annotation.id}
            annotation={annotation}
            editMode={editMode}
            onDelete={onDelete}
          />
        ))}
      </div>

      {/* Add Form Modal */}
      {showAddForm && onAdd && (
        <AddAnnotationModal
          onAdd={(data) => {
            onAdd(data);
            setShowAddForm(false);
          }}
          onCancel={() => setShowAddForm(false)}
        />
      )}
    </div>
  );
}

interface AnnotationBadgeProps {
  annotation: Annotation;
  editMode: boolean;
  onDelete?: (id: string) => void;
}

function AnnotationBadge({ annotation, editMode, onDelete }: AnnotationBadgeProps) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="flex items-center gap-2 px-2 py-1 rounded text-sm hover:bg-white dark:hover:bg-slate-700"
        style={{ borderLeft: `3px solid ${annotation.color}` }}
      >
        <span className="font-medium text-slate-700 dark:text-slate-300">
          {annotation.title}
        </span>
        <span className="text-xs text-slate-500">
          {new Date(annotation.timestamp).toLocaleDateString()}
        </span>
      </button>

      {showDetails && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowDetails(false)} />
          <div className="absolute top-full left-0 mt-1 z-20 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <h4 className="font-medium text-slate-900 dark:text-slate-100">
                  {annotation.title}
                </h4>
                {annotation.description && (
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    {annotation.description}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(annotation.timestamp).toLocaleString()}
                  </span>
                  {annotation.created_by && (
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {annotation.created_by}
                    </span>
                  )}
                </div>
              </div>
              {editMode && onDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(annotation.id);
                    setShowDetails(false);
                  }}
                  className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

interface AddAnnotationModalProps {
  onAdd: (annotation: Omit<Annotation, 'id' | 'created_at'>) => void;
  onCancel: () => void;
}

function AddAnnotationModal({ onAdd, onCancel }: AddAnnotationModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [timestamp, setTimestamp] = useState(new Date().toISOString().slice(0, 16));
  const [color, setColor] = useState('#3B82F6');

  const handleSubmit = () => {
    if (!title.trim()) return;
    onAdd({
      title: title.trim(),
      description: description.trim() || undefined,
      timestamp: new Date(timestamp).toISOString(),
      color,
    });
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal animate-slide-up max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Add Annotation
            </h3>
            <button onClick={onCancel} className="btn-ghost p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="modal-body space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Deployed v2.3.1"
              className="input"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional details..."
              rows={2}
              className="input resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Timestamp
              </label>
              <input
                type="datetime-local"
                value={timestamp}
                onChange={(e) => setTimestamp(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Color
              </label>
              <div className="flex gap-2">
                {['#3B82F6', '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6'].map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`w-8 h-8 rounded-full border-2 ${
                      color === c ? 'border-slate-900 dark:border-white' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim()}
            className="btn-primary"
          >
            Add Annotation
          </button>
        </div>
      </div>
    </div>
  );
}

export default DashboardAnnotations;
