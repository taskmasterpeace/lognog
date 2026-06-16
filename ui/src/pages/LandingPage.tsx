import { Link } from 'react-router-dom';
import {
  Search,
  Bell,
  LayoutDashboard,
  Activity,
  Shield,
  Globe,
  Github,
  ArrowRight,
  Terminal,
  Lock,
  Check,
  Container,
  HardDrive,
  Home,
} from 'lucide-react';

const features = [
  { icon: Search, title: 'A query language you already know', description: 'search, stats, filter, dedup, table, sort — Splunk-style piping that compiles straight to fast SQL.' },
  { icon: LayoutDashboard, title: 'Dashboards that tell the story', description: 'Tables, bar, pie, line, area, heatmaps, gauges, single-stats — drag, drop, drill down.' },
  { icon: Bell, title: 'Alerts that actually reach you', description: 'Threshold and no-data alerts to Slack, Discord, email, webhooks — with silencing and throttling.' },
  { icon: Activity, title: 'Live tail, in real time', description: 'Watch logs stream in as they happen over SSE — pause, resume, filter on the fly.' },
  { icon: Shield, title: 'File integrity monitoring', description: 'Know the moment a critical file changes, with SHA-256 hashing baked into the agent.' },
  { icon: Globe, title: 'GeoIP & IP classification', description: 'Automatic geolocation and RFC-compliant categorization on every address you ingest.' },
];

const integrations = [
  { name: 'Supabase', sub: 'Log Drains' },
  { name: 'Vercel', sub: 'Log Drains' },
  { name: 'OpenTelemetry', sub: 'OTLP / HTTP' },
  { name: 'Syslog', sub: 'UDP / TCP 514' },
  { name: 'Generic HTTP', sub: 'JSON API' },
  { name: 'Windows Events', sub: 'Agent' },
];

const shots = [
  { src: '/screenshot-search.png', label: 'Search', blurb: 'Pipe a query, watch it resolve in milliseconds.' },
  { src: '/screenshot-dashboards.png', label: 'Dashboards', blurb: 'Compose panels that update on their own.' },
  { src: '/screenshot-alerts.png', label: 'Alerts', blurb: 'Get told the moment something goes quiet — or loud.' },
];

const comparison = [
  { feature: 'Where your logs live', lognog: 'Your servers, full stop', them: 'Their cloud, their terms' },
  { feature: 'Monthly bill', lognog: '$0 — free forever', them: 'Per-GB, climbing' },
  { feature: 'Query language', lognog: 'Splunk-style, familiar', them: 'Proprietary, re-learn it' },
  { feature: 'Setup', lognog: 'One Docker command', them: 'Onboarding calls' },
  { feature: 'Data retention', lognog: 'However long you want', them: 'Capped by your plan' },
];

const deploy = [
  { icon: Container, title: 'Docker', body: 'docker compose up -d — the whole stack, one command.' },
  { icon: HardDrive, title: 'Single binary (Lite)', body: 'SQLite-backed build for a single machine. No dependencies.' },
  { icon: Home, title: 'Your homelab', body: 'Runs happily on a Pi, a NUC, or that old tower in the closet.' },
];

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-nog-950 font-sans text-nog-200 antialiased">
      <style>{`
        @keyframes lnRise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes lnDrift { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        .ln-rise { opacity: 0; animation: lnRise .8s cubic-bezier(.22,.61,.36,1) forwards; }
        .ln-grain { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E"); }
      `}</style>

      <div className="ln-grain pointer-events-none fixed inset-0 z-0 opacity-[0.035] mix-blend-soft-light" aria-hidden="true" />
      <div className="pointer-events-none absolute -top-40 left-1/2 z-0 h-[640px] w-[1100px] -translate-x-1/2 rounded-full bg-honey-500/15 blur-[140px]" aria-hidden="true" />
      <div className="pointer-events-none absolute top-[60vh] -left-40 z-0 h-[420px] w-[420px] rounded-full bg-honey-700/10 blur-[120px]" aria-hidden="true" />

      <div className="relative z-10">
        {/* Nav */}
        <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <div className="flex items-center gap-3">
            <img src="/lognoglogo.png" alt="LogNog" className="h-9 w-9 rounded-xl ring-1 ring-honey-500/20" />
            <span className="font-display text-2xl font-semibold tracking-tight text-nog-50">LogNog</span>
          </div>
          <nav className="flex items-center gap-2 sm:gap-5">
            <a href="https://github.com/taskmasterpeace/lognog" target="_blank" rel="noreferrer" className="hidden items-center gap-2 rounded-lg px-3 py-2 text-sm text-nog-300 transition hover:text-nog-50 sm:flex">
              <Github className="h-4 w-4" /> GitHub
            </a>
            <Link to="/login" className="rounded-lg bg-honey-500 px-4 py-2 text-sm font-medium text-nog-900 transition hover:bg-honey-400">
              Sign in
            </Link>
          </nav>
        </header>

        {/* Hero */}
        <section className="mx-auto max-w-6xl px-6 pb-10 pt-16 text-center sm:pt-24">
          <div className="ln-rise mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-honey-500/25 bg-honey-500/5 px-4 py-1.5 text-xs font-medium text-honey-300" style={{ animationDelay: '0ms' }}>
            <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-honey-400 opacity-75" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-honey-400" /></span>
            Self-hosted · open source · free forever
          </div>
          <h1 className="ln-rise font-display text-5xl font-semibold leading-[1.05] tracking-tight text-nog-50 sm:text-6xl lg:text-7xl" style={{ animationDelay: '80ms' }}>
            Your logs.<br className="sm:hidden" /> <span className="text-honey-400">Your control.</span>
          </h1>
          <p className="ln-rise mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-nog-300 sm:text-xl" style={{ animationDelay: '160ms' }}>
            Enterprise-grade log management without the enterprise price tag. A warm, self-hosted home for every log you own — with a query language you already know.
          </p>
          <div className="ln-rise mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row" style={{ animationDelay: '240ms' }}>
            <Link to="/search" className="group inline-flex items-center gap-2 rounded-xl bg-honey-500 px-7 py-3.5 text-base font-medium text-nog-900 shadow-lg shadow-honey-900/30 transition hover:bg-honey-400">
              Start searching logs <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a href="https://github.com/taskmasterpeace/lognog" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-nog-700 bg-nog-900/60 px-7 py-3.5 text-base font-medium text-nog-100 transition hover:border-nog-600 hover:bg-nog-800">
              <Github className="h-4 w-4" /> View source
            </a>
          </div>
        </section>

        {/* DSL terminal */}
        <section className="mx-auto max-w-3xl px-6 pb-8">
          <div className="ln-rise overflow-hidden rounded-2xl border border-nog-700/80 bg-nog-900/80 shadow-2xl shadow-black/40 backdrop-blur" style={{ animationDelay: '320ms' }}>
            <div className="flex items-center gap-2 border-b border-nog-800 px-4 py-3">
              <span className="h-3 w-3 rounded-full bg-nog-600" /><span className="h-3 w-3 rounded-full bg-nog-600" /><span className="h-3 w-3 rounded-full bg-honey-500" />
              <span className="ml-2 flex items-center gap-1.5 text-xs text-nog-400"><Terminal className="h-3.5 w-3.5" /> lognog · search</span>
            </div>
            <pre className="overflow-x-auto px-5 py-4 text-left font-mono text-sm leading-relaxed">
<span className="text-honey-400">search</span> <span className="text-nog-200">severity</span><span className="text-nog-500">&lt;=</span><span className="text-honey-300">3</span> <span className="text-nog-500">|</span> <span className="text-honey-400">stats</span> <span className="text-nog-200">count</span> <span className="text-nog-500">by</span> <span className="text-nog-200">hostname</span> <span className="text-nog-500">|</span> <span className="text-honey-400">sort</span> <span className="text-nog-500">desc</span> <span className="text-nog-200">count</span> <span className="text-nog-500">|</span> <span className="text-honey-400">limit</span> <span className="text-honey-300">10</span>
            </pre>
          </div>
        </section>

        {/* Trust stats */}
        <section className="mx-auto max-w-4xl px-6 py-10">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-nog-800 bg-nog-800 sm:grid-cols-4">
            {[
              { k: '10 min', v: 'to first log' },
              { k: 'Millions', v: 'of logs / day' },
              { k: '$0', v: 'per month' },
              { k: '100%', v: 'your servers' },
            ].map((s) => (
              <div key={s.v} className="bg-nog-950 px-4 py-6 text-center">
                <div className="font-display text-2xl font-semibold text-honey-400 sm:text-3xl">{s.k}</div>
                <div className="mt-1 text-xs text-nog-400">{s.v}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Product showcase */}
        <section className="mx-auto max-w-6xl px-6 py-16">
          <div className="mb-12 text-center">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-nog-50 sm:text-4xl">See it pour</h2>
            <p className="mx-auto mt-3 max-w-xl text-nog-300">Search, dashboards, alerts — the whole pour, running on hardware you own.</p>
          </div>
          <div className="space-y-16">
            {shots.map((shot, i) => (
              <div key={shot.label} className={`flex flex-col items-center gap-8 lg:flex-row ${i % 2 ? 'lg:flex-row-reverse' : ''}`}>
                <div className="lg:w-2/5">
                  <span className="font-mono text-xs uppercase tracking-widest text-honey-500">0{i + 1}</span>
                  <h3 className="mt-2 font-display text-2xl font-semibold text-nog-50">{shot.label}</h3>
                  <p className="mt-3 text-nog-300">{shot.blurb}</p>
                </div>
                <div className="lg:w-3/5">
                  <div className="overflow-hidden rounded-xl border border-nog-700/80 bg-nog-900 shadow-2xl shadow-black/40 ring-1 ring-honey-500/5">
                    <img src={shot.src} alt={`LogNog ${shot.label}`} className="w-full" loading="lazy" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-6 py-16">
          <div className="mb-12 text-center">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-nog-50 sm:text-4xl">Everything in the cup</h2>
            <p className="mx-auto mt-3 max-w-xl text-nog-300">A full observability stack, none of the bloat.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="group rounded-2xl border border-nog-800 bg-nog-900/60 p-6 transition hover:border-honey-500/30 hover:bg-nog-900">
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-honey-500/10 text-honey-400 ring-1 ring-honey-500/20">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-display text-lg font-semibold text-nog-50">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-nog-300">{f.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Integrations */}
        <section className="mx-auto max-w-6xl px-6 py-12">
          <div className="mb-8 text-center">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-nog-50 sm:text-3xl">Pour from anywhere</h2>
            <p className="mt-3 text-nog-300">Ship logs over HTTP, OTLP, syslog, or the agent.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {integrations.map((it) => (
              <div key={it.name} className="rounded-xl border border-nog-800 bg-nog-900/50 px-4 py-4 text-center transition hover:border-nog-700">
                <div className="text-sm font-medium text-nog-100">{it.name}</div>
                <div className="mt-1 font-mono text-[11px] text-honey-500/80">{it.sub}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Comparison */}
        <section className="mx-auto max-w-3xl px-6 py-16">
          <div className="mb-10 text-center">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-nog-50 sm:text-4xl">Why not just pay for the cloud?</h2>
            <p className="mx-auto mt-3 max-w-lg text-nog-300">Because your logs are yours. Here's the honest comparison.</p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-nog-800">
            <div className="grid grid-cols-3 bg-nog-900 px-5 py-3 text-xs font-medium uppercase tracking-wider text-nog-400">
              <div />
              <div className="text-center text-honey-400">LogNog</div>
              <div className="text-center">Hosted SaaS</div>
            </div>
            {comparison.map((row, i) => (
              <div key={row.feature} className={`grid grid-cols-3 items-center px-5 py-4 text-sm ${i % 2 ? 'bg-nog-950' : 'bg-nog-900/40'}`}>
                <div className="text-nog-300">{row.feature}</div>
                <div className="flex items-center justify-center gap-1.5 text-center font-medium text-nog-50"><Check className="h-3.5 w-3.5 shrink-0 text-honey-400" /> {row.lognog}</div>
                <div className="text-center text-nog-400">{row.them}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Deploy */}
        <section className="mx-auto max-w-6xl px-6 py-16">
          <div className="mb-12 text-center">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-nog-50 sm:text-4xl">Brews anywhere</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {deploy.map((d) => (
              <div key={d.title} className="rounded-2xl border border-nog-800 bg-nog-900/60 p-7 text-center">
                <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-honey-500/10 text-honey-400 ring-1 ring-honey-500/20">
                  <d.icon className="h-6 w-6" />
                </div>
                <h3 className="font-display text-lg font-semibold text-nog-50">{d.title}</h3>
                <p className="mt-2 text-sm text-nog-300">{d.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-5xl px-6 py-20">
          <div className="relative overflow-hidden rounded-3xl border border-honey-500/20 bg-nog-900 px-8 py-16 text-center">
            <div className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-64 w-64 rounded-full bg-honey-500/20 blur-[100px]" aria-hidden="true" />
            <div className="relative">
              <img src="/lognoglogo.png" alt="" className="mx-auto mb-6 h-14 w-14 rounded-2xl ring-1 ring-honey-500/20" />
              <h2 className="font-display text-3xl font-semibold tracking-tight text-nog-50 sm:text-4xl">Take your logs home.</h2>
              <p className="mx-auto mt-4 max-w-md text-nog-300">Ten minutes from now you could be searching your own logs, on your own hardware, for free.</p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link to="/search" className="inline-flex items-center gap-2 rounded-xl bg-honey-500 px-7 py-3.5 font-medium text-nog-900 transition hover:bg-honey-400">
                  Get started <ArrowRight className="h-4 w-4" />
                </Link>
                <a href="https://github.com/taskmasterpeace/lognog" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-nog-700 px-7 py-3.5 font-medium text-nog-100 transition hover:bg-nog-800">
                  <Github className="h-4 w-4" /> Star on GitHub
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-nog-800/80">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-10 sm:flex-row">
            <div className="flex items-center gap-2.5">
              <img src="/lognoglogo.png" alt="" className="h-7 w-7 rounded-lg" />
              <span className="font-display text-lg font-semibold text-nog-100">LogNog</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-nog-400">
              <Link to="/docs" className="transition hover:text-nog-100">Docs</Link>
              <a href="https://github.com/taskmasterpeace/lognog" target="_blank" rel="noreferrer" className="transition hover:text-nog-100">GitHub</a>
              <span className="flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> Self-hosted</span>
            </div>
            <p className="text-xs text-nog-500">© 2026 Machine King Labs</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
