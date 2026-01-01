# Changelog

All notable changes to LogNog are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Added

#### Alert Actions System
- **Apprise Integration** - Support for 113+ notification services (Slack, Discord, Telegram, PagerDuty, etc.)
- **AI Summaries** - Ollama/OpenRouter powered alert summaries with `{{ai_summary}}` template variable
- **Template Variables** - Rich templating with filters: `{{value:upper}}`, `{{count:comma}}`, `{{timestamp:relative}}`
- **Notification Channels** - Configure and test channels in Settings → Notifications

#### Data Sources
- **Self-Service Onboarding Wizard** - Guided setup for new log sources
- **Active Sources Dashboard** - Monitor which devices are sending logs
- **Custom Index Headers** - Organize logs with custom headers per data source
- **Tabbed Interface** - Templates and Active Sources in separate tabs

#### Search Features
- **Field Discovery Sidebar** - Splunk-style sidebar to explore fields and top values
- **Search-to-Action Buttons** - Save searches as dashboards, alerts, or reports in one click
- **Custom Field Queries** - Query fields from structured_data

#### Dashboard Features
- **Dashboard Duplicate** - One-click duplicate from dashboard cards or settings menu
- **Structured Data Display** - View custom fields in LogViewer

#### Integrations
- **Next.js Integration** - Template and enhanced ingestion for Next.js apps
- **Vercel Log Drains** - Stream Vercel logs to LogNog
- **Supabase Log Drains** - Stream Supabase logs to LogNog
- **MCP Integration** - Claude Desktop integration for AI-powered log analysis

#### Mobile UI
- **Responsive Design** - All pages optimized for mobile devices
- **Touch-Friendly** - Improved touch targets and scrolling
- **Mobile Navigation** - Collapsible menus and short labels

### Changed
- Rebranded from "Spunk" to "LogNog" throughout documentation
- Improved DSL compiler for custom field support

### Fixed
- Filter click bug in search results
- Field extraction display in LogViewer

---

## [1.0.0] - 2025-12-01

### Added
- Initial release of LogNog
- Syslog ingestion via Vector (UDP/TCP 514)
- ClickHouse storage backend
- Custom DSL query language
- JWT-based authentication
- API key management
- Dashboards with multiple visualization types
- Scheduled reports
- Knowledge management (field extractions, event types, tags, lookups)
- Workflow actions including Python scripts
- GeoIP lookup integration
- IP classification (private, public, loopback, etc.)

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to contribute to this project.

## License

LogNog is open source software.
