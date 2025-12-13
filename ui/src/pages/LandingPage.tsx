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
} from 'lucide-react';

const features = [
  {
    icon: Search,
    title: 'Powerful Search',
    description: 'Splunk-like query language with boolean logic, stats, and time analysis',
  },
  {
    icon: LayoutDashboard,
    title: '7 Visualization Types',
    description: 'Tables, charts, heatmaps, gauges with auto-refresh dashboards',
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

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="border-b border-slate-700/50">
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
                className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white font-medium rounded-lg transition-colors"
              >
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-16 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6">
            Your Logs,{' '}
            <span className="bg-gradient-to-r from-sky-400 to-cyan-400 bg-clip-text text-transparent">
              Your Control
            </span>
          </h1>
          <p className="text-xl text-slate-400 max-w-3xl mx-auto mb-8">
            Self-hosted log management for homelabs and beyond.
            100% open source, no cloud dependencies, no arbitrary limits.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-600 hover:to-cyan-600 text-white font-semibold rounded-lg shadow-lg shadow-sky-500/25 transition-all"
            >
              Get Started
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
        </div>
      </section>

      {/* Comparison Section */}
      <section className="py-16 bg-slate-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">
              How LogNog Compares
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              Built as a Splunk alternative for people who want powerful log management
              without the enterprise pricing or complexity.
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
                className="p-6 bg-slate-800/50 rounded-xl border border-slate-700/50 hover:border-sky-500/50 transition-colors"
              >
                <div className="w-12 h-12 bg-sky-500/10 rounded-lg flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-sky-400" />
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
              Send logs from anywhere - cloud platforms, network devices, or custom apps.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-4">
            {integrations.map((integration) => (
              <div
                key={integration.name}
                className="px-5 py-3 bg-slate-800 rounded-lg border border-slate-700 flex items-center gap-3"
              >
                <Server className="w-5 h-5 text-sky-400" />
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 bg-slate-800/50 rounded-xl border border-slate-700/50 text-center">
              <div className="text-4xl mb-4">📁</div>
              <h3 className="text-xl font-semibold text-white mb-2">Agent Only</h3>
              <p className="text-slate-400 text-sm mb-4">
                Monitor files on a single machine. No server needed.
              </p>
              <div className="text-xs text-slate-500">Perfect for file monitoring</div>
            </div>
            <div className="p-6 bg-gradient-to-b from-sky-900/50 to-slate-800/50 rounded-xl border border-sky-500/50 text-center relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-sky-500 text-white text-xs font-medium rounded-full">
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

      {/* CTA Section */}
      <section className="py-16 bg-gradient-to-r from-sky-600 to-cyan-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to Take Control?
          </h2>
          <p className="text-sky-100 mb-8 max-w-2xl mx-auto">
            Set up in 10 minutes. Free forever. MIT licensed.
          </p>
          <Link
            to="/login"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-sky-600 font-semibold rounded-lg shadow-lg hover:bg-sky-50 transition-colors"
          >
            Get Started Now
            <ChevronRight className="w-5 h-5" />
          </Link>
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
