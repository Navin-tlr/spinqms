import { Card, LabelCaps, FmlBox, Alert } from '../Primitives.jsx'

export default function OperatorGuide() {
  return (
    <Card sm>
      <LabelCaps>Operator quick-reference guide</LabelCaps>

      <Section title="1. Hank count formula — verified (ISO 11462-1)">
        <FmlBox>{`Ne = (Sample length in yards × 0.54) / Weight in grams\nExample: 6 yards, 26.94 g → (6 × 0.54) / 26.94 = 3.24 / 26.94 = 0.1203 Ne\nSource: Ne = L(yds)/(840 × W(lbs)) = L × 453.592/(840 × W_g) = L × 0.54/W_g`}</FmlBox>
      </Section>

      <Divider />

      <Section title="2. Department targets">
        <FmlBox>{`Carding:        0.120 Ne\nBreaker/RSB:    0.120 Ne\nRSB:            0.120 Ne\nSimplex:        1.120 Ne\nRing Frame:     47.5 Ne ±0.5  (tolerance: 47.0–48.0)\nAutoconer:      47.0 Ne ±0.5  (tolerance: 46.5–47.5)`}</FmlBox>
      </Section>

      <Divider />

      <Section title="3. Western Electric Control Rules">
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          <Alert variant="bad"><strong>Rule 1:</strong> 1 point beyond 3σ action limit → STOP machine immediately</Alert>
          <Alert variant="warn"><strong>Rule 2:</strong> 2 of 3 consecutive beyond 2σ warning limit (same side) → Check machine</Alert>
          <Alert variant="warn"><strong>Rule 3:</strong> 4 of 5 consecutive beyond 1σ (same side) → Trend detected, monitor closely</Alert>
          <Alert variant="warn"><strong>Rule 4:</strong> 8 consecutive points same side of centerline → Systematic drift, adjust draft ratio</Alert>
        </div>
      </Section>

      <Divider />

      <Section title="4. Interpreting CV%">
        <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
          <Alert variant="ok">CV% ≤ Uster 25th — top quartile, excellent</Alert>
          <Alert variant="warn">CV% 25th–50th — acceptable, monitor</Alert>
          <Alert variant="bad">CV% &gt; Uster 75th — action required</Alert>
        </div>
      </Section>

      <Divider />

      <Section title="5. Machine adjustment guide">
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr>
                <th style={{ padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--tx-3)', letterSpacing:'.05em', textTransform:'uppercase', borderBottom:'1px solid var(--bd-md)' }}>Alert</th>
                <th style={{ padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--tx-3)', letterSpacing:'.05em', textTransform:'uppercase', borderBottom:'1px solid var(--bd-md)' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['1 point beyond 3σ', 'Stop machine. Check draft settings, sliver can, gear teeth. Recalibrate rollers.'],
                ['2 of 3 beyond 2σ', 'Check drafting zone, aprons, top rollers. Inspect clothing, calendar conditions. Take 2 extra samples.'],
                ['Systematic drift (8 pts)', 'Check draft ratio, temperature, humidity. Verify belt tension, bearing lubrication.'],
                ['CV% > Uster 75th', 'Check card clothing, flats, calendar rollers. Inspect fibre quality. Inform QC supervisor.'],
                ['Cpk < 1.33', 'Process is not capable. Review specification limits and draft ratio optimization.'],
              ].map(([k, v]) => (
                <tr key={k}>
                  <td style={{ padding:'9px 12px', borderBottom:'1px solid var(--bd)', fontSize:12 }}><strong>{k}</strong></td>
                  <td style={{ padding:'9px 12px', borderBottom:'1px solid var(--bd)', fontSize:12, color:'var(--tx-2)' }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Divider />

      <Section title="6. Index of Irregularity (I)">
        <FmlBox>{`I = CV_actual / CV_theoretical\nI < 1.1  → Excellent (near ideal random drafting)\nI 1.1–1.3 → Acceptable\nI 1.3–1.5 → High — check drafting system\nI > 1.5  → Critical — systematic machine fault`}</FmlBox>
      </Section>

      <Divider />

      <Section title="7. Snapshot target logic">
        <p style={{ fontSize:13, color:'var(--tx-2)', lineHeight:1.9 }}>
          Every saved batch stores the <strong>target, USL, and LSL that were active at the moment of saving</strong>.
          This means if you change a department's target today, yesterday's data is still evaluated against yesterday's rules.
          The Data Log tab shows these snapshot values in the <em>Target @ Save</em>, <em>USL @ Save</em>, and <em>LSL @ Save</em> columns.
        </p>
      </Section>

      <Divider />

      <Section title="8. Data persistence &amp; export">
        <p style={{ fontSize:13, color:'var(--tx-2)', lineHeight:1.9 }}>
          All sample data is stored in <strong>SQLite (qms.db)</strong> on the server.<br/>
          <strong>Export CSV:</strong> Download all readings with department, shift, hank values, and snapshot targets.<br/>
          <strong>Reset defaults:</strong> Restores factory targets. Does not affect historical sample data.
        </p>
      </Section>
    </Card>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ fontSize:13, fontWeight:500, marginBottom:8 }}>{title}</div>
      {children}
    </div>
  )
}

function Divider() {
  return <div style={{ height:1, background:'var(--bd)', margin:'2px 0 14px' }} />
}
