export default function Twin(){
  return (
    <div className="page">
      <h1>DIGITAL TWIN — Gia Lai Environmental System — CURRENT · FORECAST · SCENARIO</h1>
      <div className="whatif"><h3>WHAT-IF SCENARIO</h3><div>Rainfall +20% · Temp +2°C · Road Closure 48h · Crop -10% <button className="run">RUN SIMULATION</button></div></div>
      <div className="result">Result: Risk -22% · CO₂ +14% (without) — Scenario comparison Baseline vs A  · Digital Twin Time Machine 2024→2030</div>
      <style>{`.whatif{background:#fff; border:1px solid #E2E8E5; border-radius:16px; padding:16px} .run{background:#0F766E; color:#fff; border:0; padding:8px 12px; border-radius:999px; margin-left:12px} .result{background:#fff; border:1px solid #E2E8E5; border-radius:16px; padding:16px; margin-top:12px}`}</style>
    </div>
  )
}
