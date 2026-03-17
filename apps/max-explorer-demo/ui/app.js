import { h, render } from 'https://esm.sh/preact@10.25.4'
import { useState, useEffect, useRef, useCallback } from 'https://esm.sh/preact@10.25.4/hooks'
import htm from 'https://esm.sh/htm@3.1.1'

const html = htm.bind(h)

// ============================================================================
// Hooks
// ============================================================================

function useRoute() {
  const [hash, setHash] = useState(location.hash || '#/')
  useEffect(() => {
    const handler = () => setHash(location.hash || '#/')
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])
  return hash
}

function navigate(path) { location.hash = path }

function useFetch(url) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    setLoading(true)
    setData(null)
    fetch(url).then(r => r.json()).then(d => { setData(d); setLoading(false) })
  }, [url])
  return { data, loading }
}

// ============================================================================
// App + Router
// ============================================================================

function App() {
  const route = useRoute()
  const [tray, setTray] = useState(null)

  if (route === '#/' || route === '') {
    return html`<${WorkspaceList} />`
  }

  const wsMatch = route.match(/^#\/workspace\/(.+)$/)
  if (wsMatch) {
    return html`<${WorkspaceDetail} wsId=${wsMatch[1]} tray=${tray} setTray=${setTray} />`
  }

  return html`<div class="container"><div class="empty-state">Not found</div></div>`
}

// ============================================================================
// Workspace List
// ============================================================================

function WorkspaceList() {
  const { data, loading } = useFetch('/api/workspaces')

  return html`
    <div class="container">
      <header>
        <h1>Max Explorer</h1>
        <div class="page-title">Workspaces</div>
        <div class="meta-row">
          <span>
            <span class="dot green"></span>
            ${loading ? '...' : data?.length ?? 0} workspace${data?.length !== 1 ? 's' : ''}
          </span>
        </div>
      </header>
      ${loading
        ? html`<div class="loading">Loading workspaces...</div>`
        : data?.length === 0
          ? html`<div class="empty-state">No workspaces found. Run <code>max init</code> and <code>max connect</code> first.</div>`
          : html`
            <div class="ws-grid">
              ${data.map(ws => html`
                <div class="ws-card" onClick=${() => navigate('/workspace/' + ws.id)}>
                  <h2>${ws.name}</h2>
                  <div class="ws-meta">${ws.id}</div>
                </div>
              `)}
            </div>
          `
      }
    </div>
  `
}

// ============================================================================
// Workspace Detail
// ============================================================================

function WorkspaceDetail({ wsId, tray, setTray }) {
  const { data, loading } = useFetch('/api/workspace/' + wsId)

  const openTray = useCallback((instId, entityName, schema) => {
    const entity = schema?.entities.find(e => e.name === entityName)
    const columns = ['_id'].concat(entity ? Object.keys(entity.fields) : [])
    setTray({ wsId, instId, entity: entityName, columns })
  }, [wsId, setTray])

  const closeTray = useCallback(() => setTray(null), [setTray])

  return html`
    <div class="container">
      <header>
        <h1>Max Explorer</h1>
        <div class="breadcrumb"><a href="#/">Workspaces</a> / ${data?.name ?? '...'}</div>
        <div class="page-title">${data?.name ?? 'Loading...'}</div>
        ${data && html`
          <div class="meta-row">
            <span>
              <span class="dot green"></span>
              ${data.installations.length} installation${data.installations.length !== 1 ? 's' : ''}
            </span>
          </div>
        `}
      </header>
      ${loading
        ? html`<div class="loading">Loading installations...</div>`
        : html`
          <div class="installations">
            ${data.installations.map(inst => html`
              <${InstallationCard}
                key=${inst.id}
                inst=${inst}
                tray=${tray}
                onEntityClick=${(entity) => openTray(inst.id, entity, inst.schema)}
              />
            `)}
          </div>
        `
      }
    </div>
    ${tray && html`<${DataTray} wsId=${wsId} tray=${tray} onClose=${closeTray} />`}
  `
}

// ============================================================================
// Installation Card
// ============================================================================

function InstallationCard({ inst, tray, onEntityClick }) {
  const [open, setOpen] = useState(false)
  const s = inst.schema

  return html`
    <div class=${'inst-card' + (open ? ' open' : '')}>
      <div class="inst-header" onClick=${() => setOpen(!open)}>
        <div class="inst-title">
          <h2>${inst.name}</h2>
          <span class="connector-badge">${inst.connector}</span>
        </div>
        <span class="chevron">${'\u25B6'}</span>
      </div>
      ${open && html`
        <div class="inst-body" style="display:block">
          ${inst.dbPath && html`<div class="db-path">DB: ${inst.dbPath}</div>`}
          ${s && html`<${SchemaView} schema=${s} instId=${inst.id} tray=${tray} onEntityClick=${onEntityClick} />`}
        </div>
      `}
    </div>
  `
}

// ============================================================================
// Schema View
// ============================================================================

function SchemaView({ schema, instId, tray, onEntityClick }) {
  return html`
    <div class="schema-section">
      <h3>Schema ${'\u2014'} ${schema.namespace}</h3>
      <div class="entity-grid">
        ${schema.entities.map(e => html`
          <${EntityCard}
            key=${e.name}
            entity=${e}
            active=${tray?.instId === instId && tray?.entity === e.name}
            onClick=${() => onEntityClick(e.name)}
          />
        `)}
      </div>
      ${schema.relationships.length > 0 && html`
        <div class="relationships">
          <h4>Relationships</h4>
          <div class="rel-list">
            ${schema.relationships.map(r => html`
              <span class="rel-tag">
                <span class="from">${r.from}.${r.field}</span>
                <span class="arrow">${r.cardinality === 'one' ? '->' : '->>'}</span>
                <span class="to">${r.to}</span>
              </span>
            `)}
          </div>
        </div>
      `}
    </div>
  `
}

function EntityCard({ entity, active, onClick }) {
  return html`
    <div class=${'entity-card' + (active ? ' active' : '')}
         onClick=${(ev) => { ev.stopPropagation(); onClick() }}>
      <div class="entity-name">${entity.name}</div>
      <ul class="field-list">
        ${Object.entries(entity.fields).map(([name, f]) => html`
          <li>
            <span class="field-name">${name}</span>
            <span class=${'field-type ' + f.kind}>${
              f.kind === 'scalar' ? f.type
              : f.kind === 'ref' ? '-> ' + f.target
              : '[' + f.target + ']'
            }</span>
          </li>
        `)}
      </ul>
    </div>
  `
}

// ============================================================================
// Data Tray
// ============================================================================

function DataTray({ wsId, tray, onClose }) {
  const [rows, setRows] = useState([])
  const [cursor, setCursor] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [filterText, setFilterText] = useState('')
  const [activeFilter, setActiveFilter] = useState('')
  const [filterOk, setFilterOk] = useState(true)
  const inputRef = useRef(null)

  // Validate filter on every keystroke — only promote to activeFilter if it parses
  useEffect(() => {
    if (!filterText) {
      setFilterOk(true)
      setActiveFilter('')
      return
    }
    const url = '/api/workspace/' + wsId + '/entities/' + tray.instId + '/' + tray.entity
      + '?limit=1&filter=' + encodeURIComponent(filterText)
    fetch(url).then(r => r.json()).then(data => {
      if (data.parseError) {
        setFilterOk(false)
      } else {
        setFilterOk(true)
        setActiveFilter(filterText)
      }
    })
  }, [filterText])

  const fetchData = useCallback(async (appendCursor) => {
    let url = '/api/workspace/' + wsId + '/entities/' + tray.instId + '/' + tray.entity + '?limit=50'
    if (appendCursor) url += '&cursor=' + encodeURIComponent(appendCursor)
    if (activeFilter) url += '&filter=' + encodeURIComponent(activeFilter)

    const res = await fetch(url)
    const data = await res.json()
    if (data.error) return

    setRows(prev => appendCursor ? prev.concat(data.rows) : data.rows)
    setCursor(data.cursor)
    setHasMore(data.hasMore)
  }, [wsId, tray.instId, tray.entity, activeFilter])

  // Fetch when activeFilter changes (only on successful parse) or entity changes
  useEffect(() => {
    setRows([])
    setCursor(null)
    fetchData(null)
  }, [tray.instId, tray.entity, activeFilter])

  // Focus input on open
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300)
  }, [tray.instId, tray.entity])

  // Close on Escape, or click outside tray + entity cards
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    const onClick = (e) => {
      if (e.target.closest('.data-tray') || e.target.closest('.entity-card')) return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('click', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('click', onClick)
    }
  }, [onClose])

  document.body.classList.add('tray-open')
  useEffect(() => () => document.body.classList.remove('tray-open'), [])

  const cols = tray.columns

  return html`
    <div class="data-tray open">
      <div class="tray-header">
        <div class="tray-title">
          <span>${tray.entity}</span>
          <span class="count">${rows.length} row${rows.length !== 1 ? 's' : ''}${hasMore ? '+' : ''}</span>
        </div>
        <button class="tray-close" onClick=${onClose}>${'\u00D7'}</button>
      </div>
      <div class="tray-filter">
        <input ref=${inputRef}
          class=${'filter-input' + (!filterOk ? ' error' : '')}
          type="text"
          placeholder="name ~= ben   |   priority >= 2   |   field = value AND other ~= term"
          value=${filterText}
          onInput=${(e) => setFilterText(e.target.value.trim())}
        />
        ${filterText && html`
          <span class=${'filter-status ' + (filterOk ? 'ok' : 'err')}>
            ${filterOk ? 'filtered' : 'parse error'}
          </span>
        `}
      </div>
      <div class="tray-body">
        ${rows.length === 0
          ? html`<div class="tray-loading">No data</div>`
          : html`
            <table class="data-table">
              <thead><tr>${cols.map(c => html`<th>${c}</th>`)}</tr></thead>
              <tbody>
                ${rows.map(row => html`
                  <tr>${cols.map(c => {
                    const val = row[c]
                    if (val == null) return html`<td style="color:var(--text-dim)">null</td>`
                    let str = String(val)
                    if (str.length > 80) str = str.substring(0, 77) + '...'
                    return html`<td title=${str}>${str}</td>`
                  })}</tr>
                `)}
              </tbody>
            </table>
          `
        }
      </div>
      <div class="tray-footer">
        <span class="page-info">${rows.length} loaded${hasMore ? ' (more available)' : ''}</span>
        ${hasMore && html`<button class="btn" onClick=${() => fetchData(cursor)}>Load more</button>`}
      </div>
    </div>
  `
}

// ============================================================================
// Mount
// ============================================================================

render(html`<${App} />`, document.getElementById('app'))
