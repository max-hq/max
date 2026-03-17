# Max Explorer Demo

A small platground for exploring max data.  
Browse all workspaces, installations, schemas, and data with live query filtering.

## Usage

```bash
bun run apps/max-explorer-demo/serve.ts [--port 3333]
```
Opens a UI at `http://localhost:3333` with:
- Main page listing all workspaces
- Click a workspace to see its installations and schemas
- Click any entity to open a data tray with paginated results
- Live query filtering (`name ~= Richardson`, `priority >= 2`, `active = true AND status = open`)

