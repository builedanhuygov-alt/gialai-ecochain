export default function Generic({ title, children }: { title:string; children?:React.ReactNode }){
  return (
    <div className="page">
      <h1>{title}</h1>
      <div className="card">{children || `Content for ${title} — professional geospatial intelligence view with map, KPIs, verification flow.`}</div>
      <style>{`.page{display:flex; flex-direction:column; gap:16px} .card{background:#fff; border:1px solid #E2E8E5; border-radius:16px; padding:24px} h1{font-size:18px; font-weight:800}`}</style>
    </div>
  )
}
