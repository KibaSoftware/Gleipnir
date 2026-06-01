# gleip

Command-line interface for Gleip.

## Install

```bash
npm install -D gleip
npx gleip init
```

## Quick Start

```bash
npx gleip preflight "Add CSV export to users table"
npx gleip validate-plan "Modify UserTable, reuse csv utility, add tests"
npx gleip status
```

This package owns command parsing and user-facing command wiring. Product behavior lives in reusable packages and is called from the CLI.
