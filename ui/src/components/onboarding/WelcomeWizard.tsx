import { useState, useEffect } from 'react';
import {
  X,
  Check,
  ChevronRight,
  ChevronLeft,
  Database,
  Server,
  LayoutDashboard,
  Bell,
  Sparkles,
  Play,
  Loader2,
  CheckCircle2,
  Search,
  AlertTriangle,
  Activity,
  Shield,
  Zap,
  Clock,
  Settings,
} from 'lucide-react';
import {
  generateDemoData,
  getDashboardTemplates,
  createDashboardFromTemplate,
  getAlertTemplates,
  createAlertFromTemplate,
} from '../../hooks/useOnboarding';

interface WelcomeWizardProps {
  onComplete: () => void;
  onSkip: () => void;
}

interface DashboardTemplate {
  name: string;
  description: string;
}

interface AlertTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  severity: string;
}

type WizardStep = 'welcome' | 'data-source' | 'dashboards' | 'alerts';

const STEPS: WizardStep[] = ['welcome', 'data-source', 'dashboards', 'alerts'];

export default function WelcomeWizard({ onComplete, onSkip }: WelcomeWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>('welcome');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data source step
  const [dataSourceChoice, setDataSourceChoice] = useState<'demo' | 'real' | null>(null);
  const [demoGenerated, setDemoGenerated] = useState(false);

  // Dashboard step
  const [dashboardTemplates, setDashboardTemplates] = useState<DashboardTemplate[]>([]);
  const [selectedDashboards, setSelectedDashboards] = useState<Set<string>>(new Set(['System Overview']));
  const [dashboardsCreated, setDashboardsCreated] = useState(false);

  // Alerts step
  const [alertTemplates, setAlertTemplates] = useState<AlertTemplate[]>([]);
  const [selectedAlerts, setSelectedAlerts] = useState<Set<string>>(new Set());
  const [alertsCreated, setAlertsCreated] = useState(false);

  // Load templates when reaching respective steps
  useEffect(() => {
    if (currentStep === 'dashboards' && dashboardTemplates.length === 0) {
      loadDashboardTemplates();
    }
    if (currentStep === 'alerts' && alertTemplates.length === 0) {
      loadAlertTemplates();
    }
  }, [currentStep]);

  const loadDashboardTemplates = async () => {
    try {
      const templates = await getDashboardTemplates();
      setDashboardTemplates(templates);
    } catch (err) {
      console.error('Failed to load dashboard templates:', err);
    }
  };

  const loadAlertTemplates = async () => {
    try {
      const templates = await getAlertTemplates();
      setAlertTemplates(templates);
    } catch (err) {
      console.error('Failed to load alert templates:', err);
    }
  };

  const getCurrentStepIndex = () => STEPS.indexOf(currentStep);

  const goToNextStep = () => {
    const currentIndex = getCurrentStepIndex();
    if (currentIndex < STEPS.length - 1) {
      setCurrentStep(STEPS[currentIndex + 1]);
      setError(null);
    }
  };

  const goToPreviousStep = () => {
    const currentIndex = getCurrentStepIndex();
    if (currentIndex > 0) {
      setCurrentStep(STEPS[currentIndex - 1]);
      setError(null);
    }
  };

  const handleGenerateDemoData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await generateDemoData(500);
      setDemoGenerated(true);
      setDataSourceChoice('demo');
    } catch (err) {
      setError('Failed to generate demo data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateDashboards = async () => {
    if (selectedDashboards.size === 0) {
      goToNextStep();
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      for (const templateName of selectedDashboards) {
        await createDashboardFromTemplate(templateName);
      }
      setDashboardsCreated(true);
      goToNextStep();
    } catch (err) {
      setError('Failed to create dashboards. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateAlerts = async () => {
    if (selectedAlerts.size === 0) {
      onComplete();
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      for (const templateId of selectedAlerts) {
        await createAlertFromTemplate(templateId);
      }
      setAlertsCreated(true);
      onComplete();
    } catch (err) {
      setError('Failed to create alerts. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleDashboard = (name: string) => {
    const newSet = new Set(selectedDashboards);
    if (newSet.has(name)) {
      newSet.delete(name);
    } else {
      newSet.add(name);
    }
    setSelectedDashboards(newSet);
  };

  const toggleAlert = (id: string) => {
    const newSet = new Set(selectedAlerts);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedAlerts(newSet);
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'security': return Shield;
      case 'errors': return AlertTriangle;
      case 'performance': return Zap;
      case 'availability': return Activity;
      case 'system': return Settings;
      default: return Bell;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-500 bg-red-50 dark:bg-red-900/20';
      case 'high': return 'text-orange-500 bg-orange-50 dark:bg-orange-900/20';
      case 'medium': return 'text-amber-500 bg-amber-50 dark:bg-amber-900/20';
      case 'low': return 'text-blue-500 bg-blue-50 dark:bg-blue-900/20';
      default: return 'text-slate-500 bg-slate-50 dark:bg-slate-700';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="LogNog"
              className="w-10 h-10 rounded-xl shadow-lg"
            />
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                Welcome to LogNog
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Your Logs, Your Control
              </p>
            </div>
          </div>
          <button
            onClick={onSkip}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            title="Skip setup"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Progress Indicator */}
        <div className="px-6 pt-4">
          <div className="flex items-center justify-center gap-2">
            {STEPS.map((step, i) => (
              <div key={step} className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-medium transition-colors ${
                    i === getCurrentStepIndex()
                      ? 'bg-sky-500 text-white'
                      : i < getCurrentStepIndex()
                      ? 'bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400'
                      : 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500'
                  }`}
                >
                  {i < getCurrentStepIndex() ? <Check className="w-4 h-4" /> : i + 1}
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={`w-12 h-0.5 mx-1 ${
                      i < getCurrentStepIndex() ? 'bg-sky-500' : 'bg-slate-200 dark:bg-slate-600'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-2">
            Step {getCurrentStepIndex() + 1} of {STEPS.length}
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1: Welcome */}
          {currentStep === 'welcome' && (
            <div className="text-center py-8">
              <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-sky-400 to-sky-600 rounded-2xl flex items-center justify-center shadow-lg">
                <Sparkles className="w-10 h-10 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">
                Let's get you started!
              </h3>
              <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-md mx-auto">
                LogNog is your self-hosted log management platform. This quick setup will help you:
              </p>
              <div className="space-y-4 max-w-sm mx-auto text-left">
                <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                  <div className="w-8 h-8 bg-sky-100 dark:bg-sky-900/30 rounded-full flex items-center justify-center">
                    <Database className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                  </div>
                  <span className="text-slate-700 dark:text-slate-300">Get sample data to explore</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                  <div className="w-8 h-8 bg-sky-100 dark:bg-sky-900/30 rounded-full flex items-center justify-center">
                    <LayoutDashboard className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                  </div>
                  <span className="text-slate-700 dark:text-slate-300">Create your first dashboard</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                  <div className="w-8 h-8 bg-sky-100 dark:bg-sky-900/30 rounded-full flex items-center justify-center">
                    <Bell className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                  </div>
                  <span className="text-slate-700 dark:text-slate-300">Set up optional alerts</span>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Data Source */}
          {currentStep === 'data-source' && (
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
                Choose Your Data Source
              </h3>
              <p className="text-slate-600 dark:text-slate-400 mb-6">
                Start with demo data to explore, or connect your real logs right away.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Demo Data Card */}
                <button
                  onClick={() => !demoGenerated && handleGenerateDemoData()}
                  disabled={isLoading || demoGenerated}
                  className={`p-6 rounded-xl border-2 transition-all text-left ${
                    dataSourceChoice === 'demo' || demoGenerated
                      ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/20'
                      : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
                  } ${isLoading ? 'opacity-75' : ''}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-purple-600 rounded-xl flex items-center justify-center">
                      {isLoading ? (
                        <Loader2 className="w-6 h-6 text-white animate-spin" />
                      ) : demoGenerated ? (
                        <CheckCircle2 className="w-6 h-6 text-white" />
                      ) : (
                        <Play className="w-6 h-6 text-white" />
                      )}
                    </div>
                    <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 rounded-full">
                      Quick Start
                    </span>
                  </div>
                  <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                    Generate Demo Data
                  </h4>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {demoGenerated
                      ? '500 sample logs generated!'
                      : 'Create 500 sample logs to explore LogNog features'}
                  </p>
                </button>

                {/* Real Logs Card */}
                <button
                  onClick={() => setDataSourceChoice('real')}
                  className={`p-6 rounded-xl border-2 transition-all text-left ${
                    dataSourceChoice === 'real'
                      ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/20'
                      : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-xl flex items-center justify-center">
                      <Server className="w-6 h-6 text-white" />
                    </div>
                  </div>
                  <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                    Connect Real Logs
                  </h4>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Set up syslog, HTTP ingestion, or the LogNog agent later
                  </p>
                </button>
              </div>

              {dataSourceChoice === 'real' && (
                <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                  <h5 className="font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Quick Setup Options:
                  </h5>
                  <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                    <li className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Syslog: Send to <code className="bg-slate-200 dark:bg-slate-600 px-1 rounded">UDP/TCP 514</code>
                    </li>
                    <li className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      HTTP: POST JSON to <code className="bg-slate-200 dark:bg-slate-600 px-1 rounded">/api/ingest/http</code>
                    </li>
                    <li className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Agent: Download LogNog In for Windows/Linux
                    </li>
                  </ul>
                  <p className="text-xs text-slate-500 mt-2">
                    You can configure data sources anytime from the Data Sources page.
                  </p>
                </div>
              )}

              {error && (
                <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg text-sm">
                  {error}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Dashboards */}
          {currentStep === 'dashboards' && (
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
                Create Your First Dashboard
              </h3>
              <p className="text-slate-600 dark:text-slate-400 mb-6">
                Select dashboard templates to get started quickly. You can customize them later.
              </p>

              {dashboardTemplates.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {dashboardTemplates.map((template) => (
                    <button
                      key={template.name}
                      onClick={() => toggleDashboard(template.name)}
                      className={`p-4 rounded-lg border-2 transition-all text-left ${
                        selectedDashboards.has(template.name)
                          ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/20'
                          : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <LayoutDashboard className={`w-5 h-5 ${
                            selectedDashboards.has(template.name)
                              ? 'text-sky-500'
                              : 'text-slate-400'
                          }`} />
                          <h4 className="font-medium text-slate-900 dark:text-slate-100">
                            {template.name}
                          </h4>
                        </div>
                        {selectedDashboards.has(template.name) && (
                          <CheckCircle2 className="w-5 h-5 text-sky-500" />
                        )}
                      </div>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 ml-7">
                        {template.description}
                      </p>
                    </button>
                  ))}
                </div>
              )}

              {dashboardsCreated && (
                <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-lg text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Dashboards created successfully!
                </div>
              )}

              {error && (
                <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg text-sm">
                  {error}
                </div>
              )}
            </div>
          )}

          {/* Step 4: Alerts */}
          {currentStep === 'alerts' && (
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
                Set Up Alerts (Optional)
              </h3>
              <p className="text-slate-600 dark:text-slate-400 mb-6">
                Enable pre-built alerts to monitor common issues. You can skip this and configure alerts later.
              </p>

              {alertTemplates.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
                </div>
              ) : (
                <div className="space-y-3">
                  {alertTemplates.map((template) => {
                    const Icon = getCategoryIcon(template.category);
                    return (
                      <button
                        key={template.id}
                        onClick={() => toggleAlert(template.id)}
                        className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                          selectedAlerts.has(template.id)
                            ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/20'
                            : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getSeverityColor(template.severity)}`}>
                              <Icon className="w-5 h-5" />
                            </div>
                            <div>
                              <h4 className="font-medium text-slate-900 dark:text-slate-100">
                                {template.name}
                              </h4>
                              <p className="text-sm text-slate-500 dark:text-slate-400">
                                {template.description}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className={`text-xs px-2 py-0.5 rounded-full ${getSeverityColor(template.severity)}`}>
                                  {template.severity}
                                </span>
                                <span className="text-xs text-slate-400">
                                  {template.category}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                            selectedAlerts.has(template.id)
                              ? 'border-sky-500 bg-sky-500'
                              : 'border-slate-300 dark:border-slate-600'
                          }`}>
                            {selectedAlerts.has(template.id) && (
                              <Check className="w-4 h-4 text-white" />
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {alertsCreated && (
                <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-lg text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Alerts created successfully!
                </div>
              )}

              {error && (
                <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  <strong>Note:</strong> Alerts are created without notification channels. You can configure email, Slack, or webhook notifications in Settings.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-900">
          <div>
            {currentStep !== 'welcome' && (
              <button
                onClick={goToPreviousStep}
                disabled={isLoading}
                className="flex items-center gap-2 px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onSkip}
              className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
            >
              Skip Setup
            </button>
            {currentStep === 'welcome' && (
              <button
                onClick={goToNextStep}
                className="flex items-center gap-2 px-6 py-2.5 bg-sky-500 hover:bg-sky-600 text-white rounded-lg font-medium shadow-lg shadow-sky-500/25 transition-all hover:shadow-sky-500/40"
              >
                Get Started
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
            {currentStep === 'data-source' && (
              <button
                onClick={goToNextStep}
                disabled={isLoading}
                className="flex items-center gap-2 px-6 py-2.5 bg-sky-500 hover:bg-sky-600 disabled:bg-sky-300 text-white rounded-lg font-medium"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
            {currentStep === 'dashboards' && (
              <button
                onClick={handleCreateDashboards}
                disabled={isLoading}
                className="flex items-center gap-2 px-6 py-2.5 bg-sky-500 hover:bg-sky-600 disabled:bg-sky-300 text-white rounded-lg font-medium"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : selectedDashboards.size > 0 ? (
                  <>
                    Create {selectedDashboards.size} Dashboard{selectedDashboards.size > 1 ? 's' : ''}
                    <ChevronRight className="w-4 h-4" />
                  </>
                ) : (
                  <>
                    Skip
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            )}
            {currentStep === 'alerts' && (
              <button
                onClick={handleCreateAlerts}
                disabled={isLoading}
                className="flex items-center gap-2 px-6 py-2.5 bg-sky-500 hover:bg-sky-600 disabled:bg-sky-300 text-white rounded-lg font-medium"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : selectedAlerts.size > 0 ? (
                  <>
                    <Check className="w-4 h-4" />
                    Finish Setup
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    Start Exploring
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
