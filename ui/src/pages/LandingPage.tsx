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

      {/* Hero Section */}
      <section className="py-16 sm:py-24 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-sky-500/10 rounded-full blur-3xl" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative">
          {/* Splunk users badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800/80 border border-slate-700 rounded-full text-sm text-slate-300 mb-8">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <span>Built for Splunk users who want freedom</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6">
            Your Logs,{' '}
            <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              Your Control
            </span>
          </h1>
          <p className="text-xl text-slate-300 max-w-3xl mx-auto mb-4">
            Self-hosted log management with the query language you already know.
            No cloud lock-in. No surprise bills. No arbitrary limits.
          </p>
          <p className="text-lg text-slate-500 max-w-2xl mx-auto mb-8">
            <span className="text-emerald-400 font-medium">Splunk pricing</span> made us build this.{' '}
            <span className="text-slate-400">grep is not a SIEM.</span>
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white font-semibold rounded-lg shadow-lg shadow-emerald-500/25 transition-all"
            >
              Get Started Free
              <ArrowRight className="w-5 h-5" />
            </Link>
            <a
              href="https://github.com/taskmasterpeace/lognog"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition-colors"
            >
              <Github className="w-5 h-5" />
              View on GitHub
            </a>
          </div>

          {/* Quick stats */}
          <div className="flex flex-wrap justify-center gap-8 mt-12 text-sm">
            <div className="flex items-center gap-2 text-slate-400">
              <Zap className="w-4 h-4 text-emerald-400" />
              <span>10 min setup</span>
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <Database className="w-4 h-4 text-emerald-400" />
              <span>Millions of logs/day</span>
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>MIT Licensed</span>
            </div>
          </div>
        </div>
      </section>

      {/* Hosted Coming Soon Banner */}
      <section className="py-6 bg-gradient-to-r from-purple-600/20 to-indigo-600/20 border-y border-purple-500/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-center sm:text-left">
            <div className="flex items-center gap-3">
              <Cloud className="w-6 h-6 text-purple-400" />
              <span className="text-lg font-semibold text-white">Hosted LogNog Coming Soon</span>
            </div>
            <span className="text-slate-400">•</span>
            <p className="text-slate-300">
              Don't want to self-host? We're building a managed cloud version.
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
      <section className="py-20 bg-slate-800/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              See It In Action
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              A familiar interface for anyone who's used Splunk, with the simplicity you deserve.
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

      {/* Splunk Comparison - For Splunk Users */}
      <section className="py-16 border-y border-slate-700/50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">
              Coming From Splunk?
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              Your SPL knowledge transfers directly. Same concepts, same workflow.
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

      {/* Problem Section */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-bold text-white mb-8">
            The Problem with Log Management
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-6 bg-slate-800/30 rounded-xl border border-slate-700/50">
              <p className="text-4xl mb-3 text-red-400">$$$</p>
              <p className="text-lg font-medium text-white mb-2">Splunk</p>
              <p className="text-slate-400 text-sm">Costs more than your entire homelab infrastructure</p>
            </div>
            <div className="p-6 bg-slate-800/30 rounded-xl border border-slate-700/50">
              <p className="text-4xl mb-3 text-yellow-400">YAML</p>
              <p className="text-lg font-medium text-white mb-2">ELK Stack</p>
              <p className="text-slate-400 text-sm">Requires a PhD in configuration and 8GB+ RAM</p>
            </div>
            <div className="p-6 bg-slate-800/30 rounded-xl border border-slate-700/50">
              <p className="text-4xl mb-3 text-blue-400">Cloud</p>
              <p className="text-lg font-medium text-white mb-2">SaaS Services</p>
              <p className="text-slate-400 text-sm">Your sensitive logs on someone else's servers</p>
            </div>
          </div>
          <p className="text-xl text-slate-300 mt-8">You just want to <span className="text-emerald-400 font-medium">search your logs</span>.</p>
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
              Enterprise features without the enterprise price tag.
            </p>
          </div>
          <div className="flex justify-center">
            <img
              src="/compare.png"
              alt="LogNog vs Splunk vs ELK vs Grafana Loki comparison"
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
              Everything You Need
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              Built-in dashboards, alerts, and real-time streaming. No separate tools required.
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
              Send logs from anywhere - cloud platforms, network devices, game servers, or custom apps.
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
              Choose Your Setup
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
              <div className="text-xs text-slate-500">Perfect for 1-10 machines</div>
            </div>
            <div className="p-6 bg-slate-800/50 rounded-xl border border-slate-700/50 text-center">
              <div className="text-4xl mb-4">🐳</div>
              <h3 className="text-xl font-semibold text-white mb-2">LogNog Full</h3>
              <p className="text-slate-400 text-sm mb-4">
                Docker stack with ClickHouse. Scales to millions of logs.
              </p>
              <div className="text-xs text-slate-500">Perfect for power users</div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
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

      {/* CTA Section */}
      <section className="py-16 bg-gradient-to-r from-emerald-600 to-cyan-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to Take Control?
          </h2>
          <p className="text-emerald-100 mb-8 max-w-2xl mx-auto">
            Set up in 10 minutes. Free forever. MIT licensed.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-emerald-600 font-semibold rounded-lg shadow-lg hover:bg-emerald-50 transition-colors"
            >
              Get Started Now
              <ChevronRight className="w-5 h-5" />
            </Link>
            <a
              href="https://github.com/taskmasterpeace/lognog"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-emerald-700/50 text-white font-semibold rounded-lg hover:bg-emerald-700 transition-colors border border-emerald-400/30"
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
