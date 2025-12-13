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
} from 'lucide-react';

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
    image: '/screenshot-search.png',
  },
  {
    title: 'Custom Dashboards',
    description: 'Build dashboards with 7 visualization types and auto-refresh',
    image: '/screenshot-dashboards.png',
  },
  {
    title: 'Smart Alerts',
    description: 'Threshold-based alerts with email, webhook, and silencing',
    image: '/screenshot-alerts.png',
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

      {/* Screenshot Showcase */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              See It In Action
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              A familiar interface for anyone who's used Splunk. No learning curve, just results.
            </p>
          </div>

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
                  <p className="text-slate-400 text-lg">
                    {screenshot.description}
                  </p>
                </div>
                <div className="flex-1 w-full">
                  <div className="relative group">
                    <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 rounded-xl blur-lg group-hover:blur-xl transition-all" />
                    <img
                      src={screenshot.image}
                      alt={screenshot.title}
                      className="relative rounded-xl shadow-2xl border border-slate-700/50 w-full"
                    />
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
          <div className="flex justify-center">
            <img
              src="/compare.png"
              alt="LogNog vs Splunk vs ELK vs Grafana Loki vs Google Chronicle comparison"
              className="max-w-full rounded-xl shadow-2xl border border-slate-700"
            />
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

      {/* Testimonials */}
      <section className="py-16 bg-slate-800/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">
              What People Are Saying
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 bg-slate-800/50 rounded-xl border border-slate-700/50">
              <p className="text-slate-300 mb-4 italic">
                "Got LogNog running in 10 minutes. Same search syntax I know from work. Finally."
              </p>
              <p className="text-sm text-slate-500">— Homelab enthusiast</p>
            </div>
            <div className="p-6 bg-slate-800/50 rounded-xl border border-slate-700/50">
              <p className="text-slate-300 mb-4 italic">
                "My Minecraft server generates 50GB of logs a month. Splunk wanted $2000/year. LogNog? Free."
              </p>
              <p className="text-sm text-slate-500">— Game server operator</p>
            </div>
            <div className="p-6 bg-slate-800/50 rounded-xl border border-slate-700/50">
              <p className="text-slate-300 mb-4 italic">
                "One docker-compose file. That's it. No Helm charts, no Kubernetes manifests."
              </p>
              <p className="text-sm text-slate-500">— DevOps engineer</p>
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
      <footer className="py-8 border-t border-slate-700/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img
                src="/lognoglogo.png"
                alt="LogNog"
                className="w-8 h-8 rounded-lg"
              />
              <span className="text-slate-400">
                LogNog - Your Logs, Your Control
              </span>
            </div>
            <div className="flex items-center gap-6 text-sm text-slate-500">
              <span>By Machine King Labs</span>
              <a
                href="https://github.com/taskmasterpeace/lognog"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors"
              >
                GitHub
              </a>
              <a
                href="https://github.com/taskmasterpeace/lognog/blob/main/LICENSE"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors"
              >
                MIT License
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
