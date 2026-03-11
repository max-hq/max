# Quick Start

This walkthrough uses the bundled Acme connector — a fictitious SaaS app for testing.

## 1. Start the Acme test server

```bash
cd apps/acme
./acme start --tenant default
```

## 2. Create a workspace

```bash
mkdir my-workspace && cd my-workspace
max init .
```

## 3. Connect a data source

```bash
max connect @max/connector-acme --name acme-1
```

Max walks you through authentication — you'll need an API token from the service you're connecting to.

## 4. Check your workspace

```bash
max status
max schema acme-1
```

## 5. Sync

```bash
max sync acme-1
```

```
Syncing...
  AcmeWorkspace  ██▓··      12  1021.8 op/s
  AcmeUser       █████     283  4391.1 op/s
  AcmeTask       ███▒·    2156  4811.3 op/s
  ──────────────────────────────────────────────
  3.2s elapsed
```

## 6. Query

```bash
max search acme-1 AcmeTask \
  --filter 'title ~= "protocol"' \
  --fields title,description \
  --output ndjson
```

The query runs locally against synced data — fast, cheap, and doesn't touch the upstream API.

## Install external connectors

Max has a separate [connector collection](https://github.com/max-hq/max-connectors) with connectors for Linear, GitHub, Google Workspace, and more:

```bash
max -g install --collection git@github.com:max-hq/max-connectors
```
