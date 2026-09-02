export default function Governance(){
  return (
    <div className="page">
      <h1>Governance — Gia Lai → Commune → Village</h1>
      <div className="tree"><div>Province Admin: All</div><div>└ Commune A: Own Commune → Village 1, Village 2</div><div>└ Commune B: Village 3, Village 4</div></div>
      <div className="card">Action Center: URGENT (2) · IN PROGRESS (5) · PENDING VERIFICATION (4) · COMPLETED (42) — One-click: Acknowledge / Assign / Notify</div>
      <style>{`.tree{background:#fff; border:1px solid #E2E8E5; border-radius:16px; padding:16px; font-family:monospace; font-size:13px} .card{background:#fff; border:1px solid #E2E8E5; border-radius:16px; padding:16px; margin-top:12px}`}</style>
    </div>
  )
}
