import { Link } from 'react-router-dom';
import {
  Search,
  Bell,
  LayoutDashboard,
  Activity,
  Shield,
  Server,
  Globe,
  ChevronRight,
  Github,
  ArrowRight,
  Cloud,
  Zap,
  Terminal,
  Database,
  Building2,
  Users,
  MessageSquare,
  Sparkles,
  DollarSign,
  Lock,
  Check,
  X,
} from 'lucide-react';
import ImagePlaceholder from '../components/landing/ImagePlaceholder';

const features = [
  {
    icon: Search,
    title: 'Splunk-Like Query Language',
    description: 'search, stats, filter, dedup, table - the commands you already know',
  },
  {
    icon: LayoutDashboard,
    title: '7 Visualization Types',
    description: 'Tables, bar charts, pie charts, line/area, heatmaps, gauges, single stats',
  },
  {
    icon: Bell,
    title: 'Smart Alerts',
    description: 'Threshold-based alerts with email, webhook, and silencing support',
  },
  {
    icon: Activity,
    title: 'Live Tail',
    description: 'Real-time log streaming with SSE - watch logs as they happen',
  },
  {
    icon: Shield,
    title: 'File Integrity Monitoring',
    description: 'Know when critical files change with SHA-256 hashing',
  },
  {
    icon: Globe,
    title: 'GeoIP & IP Classification',
    description: 'Automatic IP geolocation and RFC-compliant categorization',
  },
];

const integrations = [
  { name: 'Supabase', description: 'Log Drains' },
  { name: 'Vercel', description: 'Log Drains' },
  { name: 'OpenTelemetry', description: 'OTLP/HTTP' },
  { name: 'Syslog', description: 'UDP/TCP 514' },
  { name: 'Generic HTTP', description: 'JSON API' },
  { name: 'Windows Events', description: 'Agent' },
];

const screenshots = [
  {
    title: 'Powerful Search',
    description: 'Splunk-like query language with stats, filtering, and field extraction',
    aspectRatio: '16/9',
    width: 1920,
    height: 1080,
    details: 'Search interface showing DSL query bar, field extraction sidebar, and log results table with syntax highlighting',
  },
  {
    title: 'Custom Dashboards',
    description: 'Build dashboards with 7 visualization types and auto-refresh',
    aspectRatio: '16/9',
    width: 1920,
    height: 1080,
    details: 'Dashboard view with multiple panels: bar chart, line chart, pie chart, and stats tables with dark theme',
  },
  {
    title: 'Smart Alerts',
    description: 'Threshold-based alerts with email, webhook, and silencing',
    aspectRatio: '16/9',
    width: 1920,
    height: 1080,
    details: 'Alert management page showing alert rules list, severity indicators, and alert configuration form',
  },
  {
    title: 'Real-Time Live Tail',
    description: 'Watch logs stream in real-time as they arrive',
    aspectRatio: '16/9',
    width: 1920,
    height: 1080,
    details: 'Live tail view with streaming logs, auto-scroll toggle, and real-time log count metrics',
  },
  {
    title: 'NogChat AI Assistant',
    description: 'Ask questions about your logs in natural language',
    aspectRatio: '4/3',
    width: 1024,
    height: 768,
    details: 'Chat interface showing conversation with AI assistant analyzing log patterns and suggesting queries',
  },
  {
    title: 'Data Source Templates',
    description: 'Pre-built templates for common log sources',
    aspectRatio: '4/3',
    width: 1024,
    height: 768,
    details: 'Template gallery showing database, security, and web server templates with quick-start guides',
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="border-b border-slate-700/50 sticky top-0 bg-slate-900/95 backdrop-blur-sm z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src="/lognoglogo.png"
                alt="LogNog"
                className="w-10 h-10 rounded-lg"
              />
              <span className="text-xl font-bold text-white">LogNog</span>
            </div>
            <div className="flex items-center gap-4">
              <a
                href="https://github.com/taskmasterpeace/lognog"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
              >
                <Github className="w-5 h-5" />
                <span className="hidden sm:inline">GitHub</span>
              </a>
              <Link
                to="/login"
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg transition-colors"
              >
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section with Large Logo */}
      <section className="py-12 sm:py-20 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative">
          {/* Large Logo */}
          <div className="mb-8">
            <img
              src="/lognoglogo.png"
              alt="LogNog"
              className="w-32 h-32 sm:w-40 sm:h-40 mx-auto rounded-2xl shadow-2xl shadow-emerald-500/20 border-2 border-slate-700/50"
            />
          </div>

          {/* Main Tagline */}
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white mb-6 tracking-tight">
            Your Logs.{' '}
            <span className="bg-gradient-to-r from-emerald-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent">
              Your Control.
            </span>
          </h1>

          <p className="text-xl sm:text-2xl text-slate-300 max-w-3xl mx-auto mb-4">
            Enterprise-grade log management without the enterprise price tag.
          </p>

          <p className="text-lg text-slate-500 max-w-2xl mx-auto mb-10">
            Self-hosted. Open source. Query language you already know.{' '}
            <span className="text-emerald-400 font-medium">Free forever.</span>
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white text-lg font-semibold rounded-xl shadow-lg shadow-emerald-500/25 transition-all transform hover:scale-105"
            >
              Start Searching Logs
              <ArrowRight className="w-5 h-5" />
            </Link>
            <a
              href="https://github.com/taskmasterpeace/lognog"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-slate-700 hover:bg-slate-600 text-white text-lg font-semibold rounded-xl transition-colors"
            >
              <Github className="w-5 h-5" />
              View Source
            </a>
          </div>

          {/* Quick value props */}
          <div className="flex flex-wrap justify-center gap-6 sm:gap-10 text-sm sm:text-base">
            <div className="flex items-center gap-2 text-slate-300">
              <Zap className="w-5 h-5 text-emerald-400" />
              <span>10 minute setup</span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <Database className="w-5 h-5 text-emerald-400" />
              <span>Millions of logs/day</span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <DollarSign className="w-5 h-5 text-emerald-400" />
              <span>$0/month</span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <Lock className="w-5 h-5 text-emerald-400" />
              <span>Your servers only</span>
            </div>
          </div>
        </div>
      </section>

      {/* Who It's For - SMB Focus */}
      <section className="py-16 bg-slate-800/50 border-y border-slate-700/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">
              Built For Teams That Ship
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              From solo developers to growing teams - log management that scales with you, not against your budget.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-6 bg-slate-800/50 rounded-xl border border-slate-700/50 text-center">
              <div className="w-14 h-14 bg-emerald-500/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Terminal className="w-7 h-7 text-emerald-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Startups & Indies</h3>
              <p className="text-slate-400 text-sm">
                Stop paying $500/month for logs. Deploy in minutes, search in milliseconds. Focus on shipping, not infrastructure.
              </p>
            </div>

            <div className="p-6 bg-slate-800/50 rounded-xl border border-slate-700/50 text-center">
              <div className="w-14 h-14 bg-emerald-500/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Building2 className="w-7 h-7 text-emerald-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">SMBs & Agencies</h3>
              <p className="text-slate-400 text-sm">
                Manage logs for multiple clients without per-seat pricing. Full audit trails, role-based access, no vendor lock-in.
              </p>
            </div>

            <div className="p-6 bg-slate-800/50 rounded-xl border border-slate-700/50 text-center">
              <div className="w-14 h-14 bg-emerald-500/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Users className="w-7 h-7 text-emerald-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">DevOps & Homelabs</h3>
              <p className="text-slate-400 text-sm">
                One docker-compose file. Works with pfSense, Ubiquiti, game servers, and everything that speaks syslog.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* AI Onboarding Feature Coming Soon */}
      <section className="py-12 bg-gradient-to-r from-amber-600/10 to-orange-600/10 border-y border-amber-500/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-xl font-semibold text-white">AI-Powered Setup Wizard</h3>
                  <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 text-xs font-medium rounded-full">Coming Soon</span>
                </div>
                <p className="text-slate-300 max-w-2xl">
                  Don't know what to log? Our AI interviews your codebase, asks the right questions,
                  and generates exactly what you need: logging code, alert rules, and dashboards.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <MessageSquare className="w-5 h-5 text-amber-400" />
              <span className="text-slate-400 text-sm">3 questions → complete observability</span>
            </div>
          </div>
        </div>
      </section>

      {/* Hosted Coming Soon Banner */}
      <section className="py-6 bg-gradient-to-r from-purple-600/20 to-indigo-600/20 border-b border-purple-500/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-center sm:text-left">
            <div className="flex items-center gap-3">
              <Cloud className="w-6 h-6 text-purple-400" />
              <span className="text-lg font-semibold text-white">Hosted LogNog Coming Soon</span>
            </div>
            <span className="hidden sm:inline text-slate-400">•</span>
            <p className="text-slate-300">
              Don't want to self-host? Managed cloud version in development.
            </p>
            <a
              href="https://github.com/taskmasterpeace/lognog"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/50 text-purple-300 font-medium rounded-lg transition-colors text-sm"
            >
              Star for Updates
            </a>
          </div>
        </div>
      </section>

      {/* Hero Screenshot */}
      <section className="py-20 border-t border-slate-700/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              See It In Action
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              A familiar interface for anyone who's used Splunk. No learning curve, just results.
            </p>
          </div>

          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 rounded-2xl blur-xl group-hover:blur-2xl transition-all" />
            <div className="relative">
              <ImagePlaceholder
                aspectRatio="16/9"
                width={1920}
                height={1080}
                description="Full dashboard overview showing real-time log monitoring with search bar, multiple visualization panels (line charts, bar charts, stats), and live tail sidebar"
                alt="LogNog Dashboard Overview"
                className="w-full"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Screenshot Showcase */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="space-y-20">
            {screenshots.map((screenshot, index) => (
              <div
                key={screenshot.title}
                className={`flex flex-col ${
                  index % 2 === 0 ? 'lg:flex-row' : 'lg:flex-row-reverse'
                } items-center gap-8 lg:gap-12`}
              >
                <div className="flex-1 text-center lg:text-left">
                  <h3 className="text-2xl font-bold text-white mb-3">
                    {screenshot.title}
                  </h3>
                  <p className="text-slate-400 text-lg mb-4">
                    {screenshot.description}
                  </p>
                  <p className="text-sm text-slate-500">
                    {screenshot.details}
                  </p>
                </div>
                <div className="flex-1 w-full">
                  <div className="relative group">
                    <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 rounded-xl blur-lg group-hover:blur-xl transition-all" />
                    <div className="relative">
                      <ImagePlaceholder
                        aspectRatio={screenshot.aspectRatio}
                        width={screenshot.width}
                        height={screenshot.height}
                        description={screenshot.details}
                        alt={screenshot.title}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The Problem */}
      <section className="py-16 bg-slate-800/30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-bold text-white mb-10">
            The Problem with Log Management Today
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="p-6 bg-slate-800/50 rounded-xl border border-slate-700/50">
              <p className="text-3xl mb-3 text-red-400">$$$</p>
              <p className="text-lg font-medium text-white mb-2">Splunk</p>
              <p className="text-slate-400 text-sm">$1,800+/year for 500MB/day</p>
            </div>
            <div className="p-6 bg-slate-800/50 rounded-xl border border-slate-700/50">
              <p className="text-3xl mb-3 text-yellow-400">YAML</p>
              <p className="text-lg font-medium text-white mb-2">ELK Stack</p>
              <p className="text-slate-400 text-sm">3+ components, 8GB+ RAM</p>
            </div>
            <div className="p-6 bg-slate-800/50 rounded-xl border border-slate-700/50">
              <p className="text-3xl mb-3 text-blue-400">GCP</p>
              <p className="text-lg font-medium text-white mb-2">Chronicle</p>
              <p className="text-slate-400 text-sm">Google Cloud lock-in only</p>
            </div>
            <div className="p-6 bg-slate-800/50 rounded-xl border border-slate-700/50">
              <p className="text-3xl mb-3 text-purple-400">SaaS</p>
              <p className="text-lg font-medium text-white mb-2">Datadog/etc</p>
              <p className="text-slate-400 text-sm">Your logs on their servers</p>
            </div>
          </div>
          <p className="text-xl text-slate-300 mt-10">
            You just want to <span className="text-emerald-400 font-medium">search your logs</span> without selling a kidney.
          </p>
        </div>
      </section>

      {/* Splunk Comparison */}
      <section className="py-16 border-y border-slate-700/50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">
              Coming From Splunk?
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              Your SPL knowledge transfers directly. Same concepts, same workflow, zero learning curve.
            </p>
          </div>

          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
            <div className="grid grid-cols-2 text-sm font-medium">
              <div className="p-4 bg-slate-700/50 text-slate-300 text-center border-b border-slate-700">Splunk SPL</div>
              <div className="p-4 bg-emerald-900/30 text-emerald-300 text-center border-b border-slate-700">LogNog Query</div>
            </div>
            <div className="divide-y divide-slate-700/50">
              {[
                ['host=web* sourcetype=nginx', 'search hostname=web* app_name=nginx'],
                ['| stats count by host', '| stats count by hostname'],
                ['| top 10 status', '| stats count by status | sort desc | limit 10'],
                ['| dedup host | table host, status', '| dedup hostname | table hostname status'],
                ['| where count > 100', '| filter count>100'],
              ].map(([splunk, lognog], i) => (
                <div key={i} className="grid grid-cols-2 text-sm">
                  <div className="p-4 font-mono text-slate-400 border-r border-slate-700/50">{splunk}</div>
                  <div className="p-4 font-mono text-emerald-400">{lognog}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="py-16 bg-slate-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">
              How LogNog Compares
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              Enterprise features. Startup-friendly pricing. Actually open source.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="px-6 py-4 text-left text-slate-400 font-medium">Feature</th>
                  <th className="px-6 py-4 text-center text-emerald-400 font-semibold bg-emerald-900/20">LogNog</th>
                  <th className="px-6 py-4 text-center text-slate-400 font-medium">Splunk</th>
                  <th className="px-6 py-4 text-center text-slate-400 font-medium">ELK Stack</th>
                  <th className="px-6 py-4 text-center text-slate-400 font-medium">Loki</th>
                  <th className="px-6 py-4 text-center text-slate-400 font-medium">Chronicle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                <tr>
                  <td className="px-6 py-4 text-slate-300">Cost (500MB/day)</td>
                  <td className="px-6 py-4 text-center text-emerald-400 font-semibold bg-emerald-900/10">$0</td>
                  <td className="px-6 py-4 text-center text-slate-400">$1,800+/yr</td>
                  <td className="px-6 py-4 text-center text-slate-400">$0 (self-host)</td>
                  <td className="px-6 py-4 text-center text-slate-400">$0 (self-host)</td>
                  <td className="px-6 py-4 text-center text-slate-400">Google Cloud only</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-slate-300">Setup Time</td>
                  <td className="px-6 py-4 text-center bg-emerald-900/10"><Check className="w-5 h-5 text-emerald-400 mx-auto" /></td>
                  <td className="px-6 py-4 text-center"><X className="w-5 h-5 text-red-400 mx-auto" /></td>
                  <td className="px-6 py-4 text-center"><X className="w-5 h-5 text-red-400 mx-auto" /></td>
                  <td className="px-6 py-4 text-center text-slate-400">30-60 min</td>
                  <td className="px-6 py-4 text-center"><X className="w-5 h-5 text-red-400 mx-auto" /></td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-slate-300">Splunk-like Query Language</td>
                  <td className="px-6 py-4 text-center bg-emerald-900/10"><Check className="w-5 h-5 text-emerald-400 mx-auto" /></td>
                  <td className="px-6 py-4 text-center"><Check className="w-5 h-5 text-emerald-400 mx-auto" /></td>
                  <td className="px-6 py-4 text-center"><X className="w-5 h-5 text-red-400 mx-auto" /></td>
                  <td className="px-6 py-4 text-center"><X className="w-5 h-5 text-red-400 mx-auto" /></td>
                  <td className="px-6 py-4 text-center"><X className="w-5 h-5 text-red-400 mx-auto" /></td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-slate-300">Real-time Dashboards</td>
                  <td className="px-6 py-4 text-center bg-emerald-900/10"><Check className="w-5 h-5 text-emerald-400 mx-auto" /></td>
                  <td className="px-6 py-4 text-center"><Check className="w-5 h-5 text-emerald-400 mx-auto" /></td>
                  <td className="px-6 py-4 text-center"><Check className="w-5 h-5 text-emerald-400 mx-auto" /></td>
                  <td className="px-6 py-4 text-center text-slate-400">Via Grafana</td>
                  <td className="px-6 py-4 text-center"><Check className="w-5 h-5 text-emerald-400 mx-auto" /></td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-slate-300">Alert Management</td>
                  <td className="px-6 py-4 text-center bg-emerald-900/10"><Check className="w-5 h-5 text-emerald-400 mx-auto" /></td>
                  <td className="px-6 py-4 text-center"><Check className="w-5 h-5 text-emerald-400 mx-auto" /></td>
                  <td className="px-6 py-4 text-center text-slate-400">Via plugins</td>
                  <td className="px-6 py-4 text-center text-slate-400">Via Grafana</td>
                  <td className="px-6 py-4 text-center"><Check className="w-5 h-5 text-emerald-400 mx-auto" /></td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-slate-300">Memory Required</td>
                  <td className="px-6 py-4 text-center text-emerald-400 bg-emerald-900/10">2-4GB</td>
                  <td className="px-6 py-4 text-center text-slate-400">8GB+</td>
                  <td className="px-6 py-4 text-center text-slate-400">8GB+</td>
                  <td className="px-6 py-4 text-center text-slate-400">2GB+</td>
                  <td className="px-6 py-4 text-center text-slate-400">Cloud</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-slate-300">Self-Hosted</td>
                  <td className="px-6 py-4 text-center bg-emerald-900/10"><Check className="w-5 h-5 text-emerald-400 mx-auto" /></td>
                  <td className="px-6 py-4 text-center text-slate-400">Cloud-first</td>
                  <td className="px-6 py-4 text-center"><Check className="w-5 h-5 text-emerald-400 mx-auto" /></td>
                  <td className="px-6 py-4 text-center"><Check className="w-5 h-5 text-emerald-400 mx-auto" /></td>
                  <td className="px-6 py-4 text-center"><X className="w-5 h-5 text-red-400 mx-auto" /></td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-slate-300">Open Source</td>
                  <td className="px-6 py-4 text-center text-emerald-400 bg-emerald-900/10">MIT</td>
                  <td className="px-6 py-4 text-center"><X className="w-5 h-5 text-red-400 mx-auto" /></td>
                  <td className="px-6 py-4 text-center text-slate-400">Mixed</td>
                  <td className="px-6 py-4 text-center text-slate-400">AGPL</td>
                  <td className="px-6 py-4 text-center"><X className="w-5 h-5 text-red-400 mx-auto" /></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-8 text-center">
            <p className="text-slate-400 text-sm">
              Comparison based on typical homelab/SMB usage (500MB-5GB/day). Your needs may vary.
            </p>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">
              Everything You Need, Nothing You Don't
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              Dashboards, alerts, real-time streaming - all built in. No plugins to configure.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="p-6 bg-slate-800/50 rounded-xl border border-slate-700/50 hover:border-emerald-500/50 transition-colors group"
              >
                <div className="w-12 h-12 bg-emerald-500/10 rounded-lg flex items-center justify-center mb-4 group-hover:bg-emerald-500/20 transition-colors">
                  <feature.icon className="w-6 h-6 text-emerald-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-slate-400 text-sm">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section className="py-16 bg-slate-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">
              Works With Your Stack
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              Cloud platforms, network gear, game servers, custom apps - if it has logs, we ingest it.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-4">
            {integrations.map((integration) => (
              <div
                key={integration.name}
                className="px-5 py-3 bg-slate-800 rounded-lg border border-slate-700 flex items-center gap-3 hover:border-emerald-500/50 transition-colors"
              >
                <Server className="w-5 h-5 text-emerald-400" />
                <div>
                  <div className="text-white font-medium">{integration.name}</div>
                  <div className="text-xs text-slate-500">{integration.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Deployment Options */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">
              Deploy Your Way
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <div className="p-6 bg-slate-800/50 rounded-xl border border-slate-700/50 text-center">
              <div className="text-4xl mb-4">📁</div>
              <h3 className="text-xl font-semibold text-white mb-2">Agent Only</h3>
              <p className="text-slate-400 text-sm mb-4">
                Monitor files on a single machine. No server needed.
              </p>
              <div className="text-xs text-slate-500">Perfect for file monitoring</div>
            </div>
            <div className="p-6 bg-gradient-to-b from-emerald-900/50 to-slate-800/50 rounded-xl border border-emerald-500/50 text-center relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-emerald-500 text-white text-xs font-medium rounded-full">
                Popular
              </div>
              <div className="text-4xl mb-4">🖥️</div>
              <h3 className="text-xl font-semibold text-white mb-2">LogNog Lite</h3>
              <p className="text-slate-400 text-sm mb-4">
                Native Windows app with SQLite. No Docker required.
              </p>
              <div className="text-xs text-slate-500">Perfect for SMBs & small teams</div>
            </div>
            <div className="p-6 bg-slate-800/50 rounded-xl border border-slate-700/50 text-center">
              <div className="text-4xl mb-4">🐳</div>
              <h3 className="text-xl font-semibold text-white mb-2">LogNog Full</h3>
              <p className="text-slate-400 text-sm mb-4">
                Docker stack with ClickHouse. Scales to millions of logs.
              </p>
              <div className="text-xs text-slate-500">Perfect for growing teams</div>
            </div>
          </div>
        </div>
      </section>

      {/* Getting Started */}
      <section className="py-16 bg-slate-800/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">
              Get Started in Minutes
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              From zero to searching logs in three simple steps. No complex configuration required.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="relative">
              <div className="absolute -left-4 top-0 w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-lg">
                1
              </div>
              <div className="pl-12">
                <h3 className="text-xl font-semibold text-white mb-3">Clone & Start</h3>
                <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50 mb-3">
                  <code className="text-sm text-emerald-400 font-mono">
                    git clone lognog.git<br />
                    docker-compose up -d
                  </code>
                </div>
                <p className="text-slate-400 text-sm">
                  One command starts everything: database, ingestion, API, and UI.
                </p>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -left-4 top-0 w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-lg">
                2
              </div>
              <div className="pl-12">
                <h3 className="text-xl font-semibold text-white mb-3">Configure Sources</h3>
                <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50 mb-3">
                  <div className="text-sm text-slate-300 space-y-1">
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>Point syslog to port 514</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>Add Supabase webhook</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>Deploy LogNog In agent</span>
                    </div>
                  </div>
                </div>
                <p className="text-slate-400 text-sm">
                  Works with existing infrastructure. No log reformatting needed.
                </p>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -left-4 top-0 w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-lg">
                3
              </div>
              <div className="pl-12">
                <h3 className="text-xl font-semibold text-white mb-3">Search & Alert</h3>
                <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50 mb-3">
                  <code className="text-sm text-cyan-400 font-mono">
                    search severity=error<br />
                    | stats count by hostname<br />
                    | sort desc
                  </code>
                </div>
                <p className="text-slate-400 text-sm">
                  Use your existing SPL knowledge. Create dashboards and alerts instantly.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-12 text-center">
            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white text-lg font-semibold rounded-xl shadow-lg shadow-emerald-500/25 transition-all"
            >
              Start Now
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Use Cases & Testimonials */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">
              Real Teams, Real Results
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              From indie developers to growing agencies, LogNog solves real problems.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="p-6 bg-slate-800/50 rounded-xl border border-slate-700/50 hover:border-emerald-500/50 transition-colors">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Terminal className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-white font-semibold">Homelab Enthusiast</p>
                  <p className="text-xs text-slate-500">12 services, pfSense, Proxmox</p>
                </div>
              </div>
              <p className="text-slate-300 text-sm italic mb-3">
                "Got LogNog running in 10 minutes. Same search syntax I know from work. Now I can actually troubleshoot my pfSense firewall rules without grep-ing through files."
              </p>
              <div className="flex items-center gap-2 text-xs text-emerald-400">
                <Check className="w-4 h-4" />
                <span>Replaced: Splunk trial + manual grep</span>
              </div>
            </div>

            <div className="p-6 bg-slate-800/50 rounded-xl border border-slate-700/50 hover:border-emerald-500/50 transition-colors">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Server className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-white font-semibold">Game Server Operator</p>
                  <p className="text-xs text-slate-500">Minecraft, Rust, ARK servers</p>
                </div>
              </div>
              <p className="text-slate-300 text-sm italic mb-3">
                "50GB of logs per month across 8 game servers. Splunk wanted $2000/year. LogNog handles it all on a $20/month VPS. The live tail feature is perfect for watching player joins."
              </p>
              <div className="flex items-center gap-2 text-xs text-emerald-400">
                <Check className="w-4 h-4" />
                <span>Saved: $2000/year</span>
              </div>
            </div>

            <div className="p-6 bg-slate-800/50 rounded-xl border border-slate-700/50 hover:border-emerald-500/50 transition-colors">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-white font-semibold">SaaS Startup (5 people)</p>
                  <p className="text-xs text-slate-500">Next.js app on Vercel</p>
                </div>
              </div>
              <p className="text-slate-300 text-sm italic mb-3">
                "We ship the LogNog In agent with our desktop app. When users report issues, we ask them to enable log shipping. Game changer for support - we see exactly what happened."
              </p>
              <div className="flex items-center gap-2 text-xs text-emerald-400">
                <Check className="w-4 h-4" />
                <span>Support ticket time: -60%</span>
              </div>
            </div>

            <div className="p-6 bg-slate-800/50 rounded-xl border border-slate-700/50 hover:border-emerald-500/50 transition-colors">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Users className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-white font-semibold">DevOps Engineer</p>
                  <p className="text-xs text-slate-500">15-person dev team</p>
                </div>
              </div>
              <p className="text-slate-300 text-sm italic mb-3">
                "One docker-compose file. That's it. No Helm charts, no Kubernetes manifests, no Elasticsearch tuning. Junior devs can deploy it themselves. That never happened with ELK."
              </p>
              <div className="flex items-center gap-2 text-xs text-emerald-400">
                <Check className="w-4 h-4" />
                <span>Setup time: 2 hours to 10 minutes</span>
              </div>
            </div>

            <div className="p-6 bg-slate-800/50 rounded-xl border border-slate-700/50 hover:border-emerald-500/50 transition-colors">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Shield className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-white font-semibold">Security Consultant</p>
                  <p className="text-xs text-slate-500">Multi-client MSP</p>
                </div>
              </div>
              <p className="text-slate-300 text-sm italic mb-3">
                "I deploy LogNog for every client. Built-in GeoIP, SSH brute-force detection alerts, and Windows Event Log ingestion. They get enterprise security monitoring at SMB prices."
              </p>
              <div className="flex items-center gap-2 text-xs text-emerald-400">
                <Check className="w-4 h-4" />
                <span>Deployed: 23 client sites</span>
              </div>
            </div>

            <div className="p-6 bg-slate-800/50 rounded-xl border border-slate-700/50 hover:border-emerald-500/50 transition-colors">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Database className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-white font-semibold">E-commerce Platform</p>
                  <p className="text-xs text-slate-500">100K orders/month</p>
                </div>
              </div>
              <p className="text-slate-300 text-sm italic mb-3">
                "We connect Supabase, Vercel, and our database logs all to LogNog. The unified search across everything saved us during Black Friday when we had a payment gateway issue."
              </p>
              <div className="flex items-center gap-2 text-xs text-emerald-400">
                <Check className="w-4 h-4" />
                <span>MTTR: -75% (4 hours to 1 hour)</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 bg-slate-800/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">
              Frequently Asked Questions
            </h2>
          </div>
          <div className="space-y-6">
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
              <h3 className="text-lg font-semibold text-white mb-2">
                Do I really need Docker? What about Windows?
              </h3>
              <p className="text-slate-400 text-sm">
                LogNog Full uses Docker for easy deployment, but LogNog Lite runs natively on Windows with just SQLite - no containers needed.
                Perfect for small teams or Windows-only environments.
              </p>
            </div>

            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
              <h3 className="text-lg font-semibold text-white mb-2">
                How is this different from Grafana Loki?
              </h3>
              <p className="text-slate-400 text-sm">
                Loki uses LogQL (like Prometheus). LogNog uses Splunk's SPL syntax. If you already know Splunk, you can be productive in minutes.
                Plus, LogNog includes dashboards and alerts out of the box - no Grafana setup required.
              </p>
            </div>

            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
              <h3 className="text-lg font-semibold text-white mb-2">
                Can I really handle millions of logs per day?
              </h3>
              <p className="text-slate-400 text-sm">
                Yes. LogNog Full uses ClickHouse, the same database that powers Cloudflare's analytics (6M+ queries/sec).
                On a 4-core VM with 8GB RAM, you can handle 5-10M events/day. Need more? Add nodes.
              </p>
            </div>

            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
              <h3 className="text-lg font-semibold text-white mb-2">
                What about compliance? Can I use this for SOC 2 / HIPAA?
              </h3>
              <p className="text-slate-400 text-sm">
                LogNog runs entirely on your infrastructure - logs never leave your network. It includes role-based access control,
                audit logging, and retention policies. Many users deploy it for compliance logging. (But we're not lawyers - consult yours!)
              </p>
            </div>

            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
              <h3 className="text-lg font-semibold text-white mb-2">
                Is there a hosted version coming?
              </h3>
              <p className="text-slate-400 text-sm">
                Yes! Hosted LogNog is in development for teams that want the power of LogNog without self-hosting.
                Star the GitHub repo to get notified when it launches. Self-hosted will always be free and open source.
              </p>
            </div>

            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
              <h3 className="text-lg font-semibold text-white mb-2">
                Can I contribute? What's the license?
              </h3>
              <p className="text-slate-400 text-sm">
                MIT license - use it however you want. Contributions welcome! We need help with data source templates,
                documentation, and frontend polish. Check the GitHub issues for "good first issue" labels.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 bg-gradient-to-r from-emerald-600 to-cyan-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold text-white mb-4">
            Ready to Take Control of Your Logs?
          </h2>
          <p className="text-emerald-100 mb-10 max-w-2xl mx-auto text-lg">
            10 minute setup. Free forever. MIT licensed. No credit card required.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-2 px-10 py-4 bg-white text-emerald-600 text-lg font-semibold rounded-xl shadow-lg hover:bg-emerald-50 transition-colors"
            >
              Get Started Now
              <ChevronRight className="w-5 h-5" />
            </Link>
            <a
              href="https://github.com/taskmasterpeace/lognog"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-10 py-4 bg-emerald-700/50 text-white text-lg font-semibold rounded-xl hover:bg-emerald-700 transition-colors border border-emerald-400/30"
            >
              <Github className="w-5 h-5" />
              Star on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-slate-700/50 bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <img
                  src="/lognoglogo.png"
                  alt="LogNog"
                  className="w-10 h-10 rounded-lg"
                />
                <span className="text-white font-bold text-lg">LogNog</span>
              </div>
              <p className="text-slate-400 text-sm mb-4">
                Your Logs, Your Control. Open source log management for teams that value simplicity.
              </p>
              <div className="flex items-center gap-3">
                <a
                  href="https://github.com/taskmasterpeace/lognog"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <Github className="w-5 h-5" />
                </a>
              </div>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link to="/search" className="text-slate-400 hover:text-white transition-colors">
                    Search
                  </Link>
                </li>
                <li>
                  <Link to="/dashboards" className="text-slate-400 hover:text-white transition-colors">
                    Dashboards
                  </Link>
                </li>
                <li>
                  <Link to="/alerts" className="text-slate-400 hover:text-white transition-colors">
                    Alerts
                  </Link>
                </li>
                <li>
                  <Link to="/data-sources" className="text-slate-400 hover:text-white transition-colors">
                    Data Sources
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-4">Resources</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a
                    href="https://github.com/taskmasterpeace/lognog#readme"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    Documentation
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/taskmasterpeace/lognog/blob/main/docs/QUERY-LANGUAGE.md"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    Query Language
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/taskmasterpeace/lognog/issues"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    GitHub Issues
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/taskmasterpeace/lognog/blob/main/CONTRIBUTING.md"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    Contributing
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-4">Deploy</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a
                    href="https://github.com/taskmasterpeace/lognog/blob/main/docs/DEPLOYMENT.md"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    LogNog Full (Docker)
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/taskmasterpeace/lognog/blob/main/lite/README.md"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    LogNog Lite (Windows)
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/taskmasterpeace/lognog/blob/main/agent/README.md"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    LogNog In Agent
                  </a>
                </li>
                <li>
                  <span className="text-slate-500">Hosted (Coming Soon)</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-slate-700/50 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500">
            <div className="flex items-center gap-4">
              <span>2025 Machine King Labs</span>
              <a
                href="https://github.com/taskmasterpeace/lognog/blob/main/LICENSE"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors"
              >
                MIT License
              </a>
            </div>
            <div className="flex items-center gap-4">
              <span>Built with ClickHouse, React, Node.js</span>
              <span className="hidden sm:inline">•</span>
              <span>Open Source Forever</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
