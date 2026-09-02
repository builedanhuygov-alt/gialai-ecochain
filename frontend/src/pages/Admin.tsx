export default function Admin(){
  return (
    <div className="page">
      <h1>Administration — Users · Roles · Data Sources · Agents · System Health</h1>
      <div className="health"><div>Database ● Online</div><div>API ● Online</div><div>GEE ● Connected (Sentinel-2 14:32)</div><div>AI Services ● Online</div></div>
      <div className="agents"><div>FOREST AGENT ● ONLINE 99.1%</div><div>DISASTER AGENT ● ONLINE</div><div>LOGISTICS AGENT ● ONLINE</div></div>
      <div className="audit">Audit Log: 14:32 Province Admin Verified Incident Village A SUCCESS</div>
      <style>{`.health,.agents{display:grid; grid-template-columns:repeat(2,1fr); gap:12px; margin-top:12px} .health div,.agents div{background:#fff; border:1px solid #E2E8E5; border-radius:12px; padding:12px; font-size:13px} .audit{background:#fff; border:1px solid #E2E8E5; border-radius:12px; padding:12px; margin-top:12px; font-size:13px; font-family:monospace}`}</style>
    </div>
  )
}
