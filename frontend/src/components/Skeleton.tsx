export function Skeleton({ h=16, w='100%' }: { h?:number; w?:string|number }){
  return <div style={{height:h, width:w, background:'#E2E8E5', borderRadius:8, opacity:0.6}} className="skeleton" />
}
export function EmptyState({ icon='🌿', title='Không có dữ liệu', desc, cta }: { icon?:string; title:string; desc?:string; cta?:string }){
  return (
    <div style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:16, padding:32, textAlign:'center'}}>
      <div style={{fontSize:32}}>{icon}</div>
      <div style={{fontWeight:700, marginTop:8}}>{title}</div>
      {desc && <div style={{fontSize:13, color:'#64748B', marginTop:6}}>{desc}</div>}
      {cta && <button style={{marginTop:12, background:'#0F766E', color:'#fff', border:0, padding:'8px 14px', borderRadius:999}}>{cta}</button>}
    </div>
  )
}
export function SuccessFeedback({ msg }: { msg:string }){
  return <div style={{background:'#DCFCE7', color:'#166534', padding:'10px 12px', borderRadius:12, display:'flex', gap:8, alignItems:'center'}}><span>✓</span> {msg}</div>
}
