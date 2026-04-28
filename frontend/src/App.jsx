import { useState, useEffect, useCallback } from 'react'
import Layout from './components/Layout.jsx'
import LandingPage from './components/views/LandingPage.jsx'
import Overview from './components/views/Overview.jsx'
import DataEntry from './components/views/DataEntry.jsx'
import ControlCharts from './components/views/ControlCharts.jsx'
import UsterBenchmarks from './components/views/UsterBenchmarks.jsx'
import ShiftReport from './components/views/ShiftReport.jsx'
import Settings from './components/views/Settings.jsx'
import DataLog from './components/views/DataLog.jsx'
import OperatorGuide from './components/views/OperatorGuide.jsx'
import YarnLab from './components/views/YarnLab.jsx'
import ProductionEntry from './components/views/ProductionEntry.jsx'
import ProductionLog from './components/views/ProductionLog.jsx'
import InventoryPlanning from './components/views/InventoryPlanning.jsx'
import PurchaseFlow from './components/views/PurchaseFlow.jsx'
import { Spinner } from './components/Primitives.jsx'
import { getDepts, getOverview, getAlerts, getUster } from './api.js'

/* ── Machine config — which depts have frame tracking and how many ───────── */
export const MACHINE_CONFIG = {
  ringframe: { max: 25, label: 'Frame',   noun: 'Frame #'   },
  carding:   { max: 3,  label: 'Card',    noun: 'Card #'    },
  simplex:   { max: 3,  label: 'Simplex', noun: 'Simplex #' },
}

/* ── Contextual machine filter bar ───────────────────────────────────────── */
function MachineFilterBar({ currentDept, machineFilter, setMachineFilter }) {
  const conf = MACHINE_CONFIG[currentDept]
  if (!conf) return null

  const nums = Array.from({ length: conf.max }, (_, i) => i + 1)

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      padding: '10px 16px',
      background: 'var(--bg)', border: '1px solid var(--bd)',
      borderRadius: 'var(--r-lg)', marginBottom: 12,
    }}>
      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--tx-3)', flexShrink: 0 }}>
        {conf.noun}
      </span>
      <button
        onClick={() => setMachineFilter(null)}
        style={{
          padding: '4px 12px', fontSize: 11, fontWeight: machineFilter === null ? 600 : 400,
          border: '1.5px solid', borderRadius: 20, cursor: 'pointer',
          fontFamily: 'var(--font)', transition: 'all .12s', lineHeight: 1,
          background: machineFilter === null ? 'var(--claude)' : 'transparent',
          color:      machineFilter === null ? '#fff' : 'var(--tx-2)',
          borderColor: machineFilter === null ? 'var(--claude)' : 'var(--bd-md)',
        }}
      >All</button>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {nums.map(n => (
          <button key={n} onClick={() => setMachineFilter(machineFilter === n ? null : n)}
            style={{
              padding: '4px 9px', fontSize: 11, fontWeight: machineFilter === n ? 600 : 400,
              border: '1.5px solid', borderRadius: 20, cursor: 'pointer',
              fontFamily: 'var(--mono)', transition: 'all .12s', lineHeight: 1, minWidth: 30, textAlign: 'center',
              background: machineFilter === n ? 'var(--claude)' : 'transparent',
              color:      machineFilter === n ? '#fff' : 'var(--tx-2)',
              borderColor: machineFilter === n ? 'var(--claude)' : 'var(--bd-md)',
            }}
          >{n}</button>
        ))}
      </div>
      {machineFilter !== null && (
        <span style={{ fontSize: 11, color: 'var(--tx-3)', marginLeft: 4 }}>
          Showing {conf.label} #{machineFilter} only
        </span>
      )}
    </div>
  )
}

export default function App() {
  const [view,          setView]          = useState('overview')
  const [currentDept,   setCurrentDept]   = useState('ringframe')
  const [depts,         setDepts]         = useState([])
  const [overview,      setOverview]      = useState([])
  const [alerts,        setAlerts]        = useState([])
  const [usterData,     setUsterData]     = useState([])
  const [lastSaved,     setLastSaved]     = useState('')
  const [refreshKey,    setRefreshKey]    = useState(0)
  const [loading,       setLoading]       = useState(true)
  const [machineFilter, setMachineFilter] = useState(null)
  /* ── Module switching ─────────────────────────────────────────────────── */
  const [currentModule,    setCurrentModule]    = useState(null)        // null = landing | 'quality' | 'production'
  const [productionView,   setProductionView]   = useState('production-entry')

  // Reset machine filter when department changes
  useEffect(() => { setMachineFilter(null) }, [currentDept])

  // ── Initial load ───────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    try {
      const [d, ov, al, us] = await Promise.all([
        getDepts(), getOverview(), getAlerts(), getUster(),
      ])
      const ovMap = Object.fromEntries(ov.map(o => [o.dept_id, o]))
      setDepts(d.map(dept => ({ ...dept, quality: ovMap[dept.id]?.quality ?? null })))
      setOverview(ov)
      setAlerts(al)
      setUsterData(us)
      setLastSaved('Updated ' + new Date().toLocaleTimeString())
    } catch (e) {
      console.error('Load error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll, refreshKey])

  const handleSaved = () => { setLastSaved('Saving…'); setRefreshKey(k => k + 1) }
  const handleSettingsChanged = () => { setRefreshKey(k => k + 1) }

  const hasBad    = alerts.some(a => a.severity === 'bad')
  const hasWarn   = alerts.some(a => a.severity === 'warn')
  const statusTxt = hasBad ? 'Action required' : hasWarn ? 'Warnings active' : 'All systems active'

  if (loading) {
    return (
      <div style={{ display:'flex', height:'100vh', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:16, background:'#f5f6f8' }}>
        <div style={{ width:40, height:40, background:'#354a5e', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ width:20, height:20, borderRadius:'50%', border:'2px solid rgba(255,255,255,.25)', borderTopColor:'#fff', animation:'spin .7s linear infinite' }} />
        </div>
        <div style={{ fontSize:13, color:'#6a6d70', fontWeight:500 }}>Connecting to SpinQMS…</div>
      </div>
    )
  }

  /* ── Landing page (no module selected) ──────────────────────────────── */
  if (currentModule === null) {
    return (
      <div style={{ height: '100vh', overflowY: 'auto' }}>
        <LandingPage
          setCurrentModule={setCurrentModule}
          overview={overview}
          alerts={alerts}
          depts={depts}
        />
      </div>
    )
  }

  /* Views that show the machine filter bar */
  const showMachineBar = view === 'charts' || view === 'log'

  return (
    <Layout
      view={view} setView={setView}
      currentDept={currentDept} setCurrentDept={setCurrentDept}
      depts={depts} alerts={alerts} statusTxt={statusTxt} lastSaved={lastSaved}
      currentModule={currentModule} setCurrentModule={setCurrentModule}
      productionView={productionView} setProductionView={setProductionView}
    >
      {/* ── Production Module ────────────────────────────────────────────── */}
      {currentModule === 'production' && (
        <>
          {productionView === 'production-entry' && (
            <ProductionEntry onSaved={() => setProductionView('production-log')} />
          )}
          {productionView === 'production-log' && <ProductionLog />}
          {productionView === 'inventory-stock' && <InventoryPlanning mode="stock" />}
          {productionView === 'inventory-issue' && <InventoryPlanning mode="issue" />}
          {productionView === 'inventory-movements' && <InventoryPlanning mode="movements" />}
          {productionView === 'inventory-planning' && <InventoryPlanning mode="planning" />}
          {productionView === 'purchase-requisitions' && <PurchaseFlow mode="requisitions" />}
          {productionView === 'purchase-orders' && <PurchaseFlow mode="orders" />}
        </>
      )}

      {/* ── Quality Module ────────────────────────────────────────────────── */}
      {currentModule === 'quality' && (
        <>
          {showMachineBar && (
            <MachineFilterBar
              currentDept={currentDept}
              machineFilter={machineFilter}
              setMachineFilter={setMachineFilter}
            />
          )}
          {view === 'overview' && (
            <Overview overview={overview} currentDept={currentDept} setCurrentDept={setCurrentDept} />
          )}
          {view === 'entry' && (
            <DataEntry depts={depts} currentDept={currentDept} setCurrentDept={setCurrentDept} onSaved={handleSaved} />
          )}
          {view === 'charts' && (
            <ControlCharts overview={overview} currentDept={currentDept} depts={depts} machineFilter={machineFilter} />
          )}
          {view === 'uster' && <UsterBenchmarks />}
          {view === 'report' && <ShiftReport />}
          {view === 'log' && (
            <DataLog depts={depts} refreshKey={refreshKey} currentDept={currentDept} machineFilter={machineFilter} />
          )}
          {view === 'settings' && <Settings depts={depts} onSettingsChanged={handleSettingsChanged} />}
          {view === 'guide' && <OperatorGuide />}
          {view === 'lab'   && <YarnLab depts={depts.filter(d => ['rsb', 'simplex', 'ringframe'].includes(d.id))} />}
        </>
      )}
    </Layout>
  )
}
