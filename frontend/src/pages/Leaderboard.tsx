export default function Leaderboard(){
  return (
    <div className="page">
      <h1>Leaderboard — Recognition, not shaming</h1>
      <div className="tabs"><span>Forest Guardian</span><span>Disaster Preparedness</span><span>Fastest Response</span><span>Green Logistics</span></div>
      <table className="board"><thead><tr><th>#</th><th>Commune</th><th>Score</th><th>Change</th><th>Achievement</th></tr></thead><tbody><tr><td>1</td><td>Xã A</td><td>92</td><td>↑2</td><td>🏅 Forest Guardian</td></tr><tr><td>2</td><td>Xã B</td><td>88</td><td>→</td><td>🏅 Green Logistics</td></tr></tbody></table>
      <style>{`.tabs{display:flex; gap:8px; font-size:13px} .tabs span{background:#F1F5F3; padding:6px 10px; border-radius:999px} table{background:#fff; border:1px solid #E2E8E5; border-radius:12px; width:100%; border-collapse:collapse; margin-top:12px} th,td{padding:10px; text-align:left; border-bottom:1px solid #E2E8E5; font-size:13px}`}</style>
    </div>
  )
}
