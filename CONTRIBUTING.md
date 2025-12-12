# Contributing to LogNog

Thank you for your interest in contributing to LogNog!

## Getting Started

1. Fork the repository
2. Clone your fork
3. Create a feature branch (`git checkout -b feature/amazing-feature`)
4. Make your changes
5. Run tests (`npm test` in api/, `pytest` in agent/)
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

## Development Setup

### API
```bash
cd api
npm install
npm run dev
```

### UI
```bash
cd ui
npm install
npm run dev
```

### Agent
```bash
cd agent
pip install -e ".[dev]"
python -m lognog_in
```

## Code Style

- TypeScript: Follow the existing style, use ESLint
- Python: Follow PEP 8, use Black formatter
- React: Functional components with hooks

## Testing

- Write tests for new features
- Ensure all existing tests pass
- API tests: `cd api && npm test`
- Agent tests: `cd agent && pytest`

## Reporting Issues

- Use GitHub Issues
- Include steps to reproduce
- Include LogNog version and environment details

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
