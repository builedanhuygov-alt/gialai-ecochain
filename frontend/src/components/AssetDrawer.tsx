import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, photoUrl } from '../services/api'

// Enterprise asset UX — drawer thay popup nổi: bản đồ luôn đọc được,
// ngữ cảnh được giữ, không modal giữa màn hình.

// P9 groups (fixed vocabulary, no long lists).
export const GROUPS = ['Water', 'Stations', 'Routes', 'Communities', 'Historical'] as const

export type DrawerItem = {
  key: string
  kind: 'asset' | 'water' | 'hydro' | 'commune' | 'communePoint' | 'hotspot' | 'alert' | 'hist' | 'risk' | 'civ' | 'route' | 'location'
  icon: string
  name: string
  typeLabel: string
  lon: number
  lat: number
  status?: string
  priority?: string
  distanceKm?: number | null
  manager?: string
  contact?: string
  note?: string
  // P2 road survey (hiện đúng field API trả về, thiếu → MISSING).
  survey?: { road?: string | null; surface?: string | null; seasonal?: string | null; vehicleLimit?: number | null; source?: string | null; verified?: string | null }
  // P3 community directory (từ geojson thật; sơ tán chưa có → MISSING rõ).
  evac?: string | null
  assetId?: string
  previewImageUrl?: string | null
  viewer?: any | null
  // async commune diagnosis (risk/brief/thumbnail) — fills in place.
  diagnosis?: null | {
    loading?: boolean; level?: string; label?: string; driver?: string;
    action?: string; coverage?: string; firms?: number; temp?: number | string | null;
    rain14?: number | null; dryDays?: number | null; watch?: string; error?: string; thumbUrl?: string | null;
    sigs?: string; missing?: string; brief?: string;
  }
  // fire point context (hotspot/alert).
  fire?: { date?: string; confidence?: string; distanceKm?: number | null } | null
}

export type NearbyItem = { key: string; icon: string; name: string; sub?: string; distKm: number }
export type NearbyGroup = { group: string; items: NearbyItem[] }

// P3: geojson xã nhúng HTML (lanh_dao/tru_so) — strip tag, giữ text thật
// (tên + SĐT lãnh đạo, địa chỉ trụ sở). Không render HTML lạ.
export function stripHtml(html: unknown): string {
  return String(html ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

export function haversineKm(lon1: number, lat1: number, lon2: number, lat2: number){  const r = 6371, p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180
  const dp = (lat2 - lat1) * Math.PI / 180, dl = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * r * Math.asin(Math.sqrt(a))
}

// P9: gom điểm lân cận theo 5 nhóm cố định (dữ liệu sẵn có, không API mới).
export function groupNearby(lon: number, lat: number, pools: { group: string; pts: { key: string; icon: string; name: string; sub?: string; lon: number; lat: number }[] }[], radiusKm = 5, perGroup = 3): NearbyGroup[] {
  return pools.map(p=> ({
    group: p.group,
    items: p.pts
      .map(q=> ({ ...q, distKm: haversineKm(lon, lat, q.lon, q.lat) }))
      .filter(q=> q.distKm <= radiusKm && q.distKm > 0.001)
      .sort((a, b)=> a.distKm - b.distKm)
      .slice(0, perGroup)
      .map(({ key, icon, name, sub, distKm })=> ({ key, icon, name, sub, distKm })),
  })).filter(g=> g.items.length > 0)
}

function ViewerBlock({ viewer, assetId }: { viewer: any; assetId?: string }){
  if(viewer?.viewer_type === 'panoee' && viewer?.viewer_url)
    return <div style={{marginTop:6}}><Link to={`/viewer/${assetId}`} style={{display:'inline-block',background:'#0F766E',color:'#fff',borderRadius:999,padding:'6px 12px',fontSize:11,fontWeight:700,textDecoration:'none'}}>🌐 Xem 360°</Link></div>
  if(viewer?.viewer_type === 'streetview' && viewer?.viewer_url)
    return <div style={{marginTop:6}}><a href={viewer.viewer_url} target="_blank" rel="noreferrer" style={{display:'inline-block',background:'#0F766E',color:'#fff',borderRadius:999,padding:'6px 12px',fontSize:11,fontWeight:700,textDecoration:'none'}}>🌐 Mở 360° (Street View)</a></div>
  if(viewer?.viewer_type === 'streetview')
    return <div style={{marginTop:6, fontSize:11, color:'#64748B'}}>🌐 Street View đã xác minh — chưa lưu URL.</div>
  if(viewer?.viewer_type === 'photos')
    return <div style={{marginTop:6, fontSize:11, color:'#64748B'}}>📷 Có ảnh thực địa quanh đây (xem mục Ảnh).</div>
  return null
}

export function HoverPreview({ x, y, name, type, meta }: { x: number; y: number; name: string; type: string; meta: string }){
  return (
    <div className="anim-tip" style={{position:'fixed', left:Math.min(x + 14, window.innerWidth - 220), top:Math.max(y - 10, 10), zIndex:60,
      background:'#0B1412', color:'#fff', borderRadius:8, padding:'6px 10px', fontSize:11, pointerEvents:'none',
      boxShadow:'0 4px 12px rgba(0,0,0,0.3)', maxWidth:200}}>
      <b>{name}</b><br/><span style={{opacity:0.85}}>{type}{meta ? ` · ${meta}` : ''}</span>
    </div>
  )
}

export default function AssetDrawer({ item, pinned, leaving, nearby, onClose, onTogglePin, onFocus, onSimulate, onSelect, onForecast }: {
  item: DrawerItem
  pinned: boolean
  leaving?: boolean
  nearby: NearbyGroup[]
  onClose: ()=>void
  onTogglePin: ()=>void
  onFocus: (item: DrawerItem)=>void
  onSimulate: (lon: number, lat: number)=>void
  onSelect: (key: string)=>void
  onForecast?: (item: DrawerItem)=>void
}){
  const [expanded, setExpanded] = useState(false)
  const [photos, setPhotos] = useState<{ url: string; thumb: string }[]>([])
  const [photosState, setPhotosState] = useState<'loading' | 'done'>('loading')
  // P8: ảnh thật (preview + ảnh quanh điểm) — không có thì câu chuẩn.
  useEffect(()=>{
    setPhotos([]); setPhotosState('loading')
    let dead = false
    const found: { url: string; thumb: string }[] = []
    if(item.previewImageUrl) found.push({ url: item.previewImageUrl, thumb: item.previewImageUrl })
    api.recentPhotos(20).then((d:any)=>{
      if(dead) return
      const rows = Array.isArray(d?.photos) ? d.photos : []
      for(const p of rows){
        if(!Array.isArray(p.location) || typeof p.location[0] !== 'number') continue
        if(Math.hypot((p.location[1] - item.lon) * 100, (p.location[0] - item.lat) * 100) >= 15) continue
        if(p.url) found.push({ url: photoUrl(p.url), thumb: photoUrl(p.thumb_url || p.url) })
        if(found.length >= 3) break
      }
      if(!dead){ setPhotos(found.slice(0, 3)); setPhotosState('done') }
    }).catch(()=>{ if(!dead) setPhotosState('done') })
    return ()=>{ dead = true }
  },[item.key, item.lon, item.lat, item.previewImageUrl])
  const hasViewer = item.viewer?.viewer_type === 'panoee' || item.viewer?.viewer_type === 'streetview'
  const dg = item.diagnosis
  const canSim = item.kind === 'hotspot' || item.kind === 'alert' || item.kind === 'commune' || item.kind === 'communePoint' || item.kind === 'location'
  return (
    <div className={`asset-drawer elev-3 ${leaving ? 'anim-drawer-out' : 'anim-drawer-in'}`} role="complementary" aria-label={`Chi tiết ${item.name}`}
      style={{position:'absolute', top:64, right:12, bottom:58, width:'min(360px, calc(100vw - 24px))', zIndex:30,
        background:'#fff', border:'1px solid #E2E8E5', borderRadius:12,
        display:'flex', flexDirection:'column', overflow:'hidden'}}>
      <div key={item.key} className="anim-swap" style={{display:'flex', flexDirection:'column', overflow:'hidden', minHeight:0, flex:1}}>
      {/* header */}
      <div style={{display:'flex', gap:8, alignItems:'center', padding:'10px 12px', borderBottom:'1px solid #F1F5F9'}}>
        <span style={{fontSize:20}}>{item.icon}</span>
        <div style={{flex:1, minWidth:0}}>
          <b style={{fontSize:13, display:'block', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{item.name}</b>
          <span style={{fontSize:11, color:'#64748B'}}>{item.typeLabel}{item.status ? ` · ${item.status}` : ''}</span>
        </div>
        <button onClick={onTogglePin} title={pinned ? 'Bỏ ghim (click bản đồ sẽ đóng)' : 'Ghim (giữ để so sánh)'} aria-pressed={pinned}
          style={{border: pinned ? '2px solid #0F766E' : '1px solid #E2E8E5', background: pinned ? '#ECFDF5' : '#fff', borderRadius:8, width:30, height:30, cursor:'pointer', fontSize:14}}>📌</button>
        <button onClick={onClose} title="Đóng (ESC)" aria-label="Đóng"
          style={{border:'1px solid #E2E8E5', background:'#fff', borderRadius:8, width:30, height:30, cursor:'pointer', fontWeight:800}}>✕</button>
      </div>
      {/* P7 action bar — không đào menu */}
      <div style={{display:'flex', gap:6, padding:'8px 12px', borderBottom:'1px solid #F1F5F9', flexWrap:'wrap'}}>
        <button onClick={()=> onFocus(item)} title="Di chuyển tới điểm (giữ nguyên mức zoom)" style={abtn}>📍 Focus</button>
        {canSim
          ? <button onClick={()=> onSimulate(item.lon, item.lat)} title="Mô phỏng lan truyền tại điểm" style={abtn}>🧭 Mô phỏng</button>
          : <Link to={`/firesim?lat=${item.lat}&lon=${item.lon}`} title="Mở kịch bản cháy tại điểm" style={{...abtn, textDecoration:'none', display:'inline-block'}}>🧭 Kịch bản</Link>}
        <button onClick={()=> document.getElementById('drawer-photos')?.scrollIntoView({ block:'nearest' })} title="Xem ảnh" style={abtn}>🖼 Ảnh</button>
        {hasViewer && (item.viewer?.viewer_url
          ? <a href={item.viewer.viewer_type === 'panoee' ? `/viewer/${item.assetId}` : item.viewer.viewer_url} target={item.viewer.viewer_type === 'panoee' ? undefined : '_blank'} rel="noreferrer" title="Mở 360°" style={{...abtn, textDecoration:'none', display:'inline-block'}}>🌐 360°</a>
          : <button disabled title="Chưa có URL 360°" style={{...abtn, opacity:0.5, cursor:'default'}}>🌐 360°</button>)}
        <button onClick={()=> setExpanded(e=> !e)} title="Chi tiết đầy đủ" aria-expanded={expanded} style={abtn}>📋 Chi tiết</button>
      </div>
      {/* body */}
      <div style={{overflow:'auto', padding:'10px 12px', display:'flex', flexDirection:'column', gap:8, fontSize:12}}>
        <div style={{display:'flex', flexDirection:'column', gap:3, color:'#334155'}}>
          {item.priority && <div>Ưu tiên: <b>{item.priority}</b></div>}
          {item.distanceKm != null && <div>Cách tâm bản đồ: <b>{item.distanceKm.toFixed(1)} km</b></div>}
          {item.manager && <div>Quản lý: {item.manager}</div>}
          {item.contact && <div>Liên hệ: {item.contact}</div>}
          {item.note && <div style={{color:'#64748B'}}>{item.note}</div>}
          {item.evac != null && <div>Sơ tán: <b>{item.evac}</b></div>}
          {item.survey && (
            <div style={{background:'#F8FAFC', borderRadius:8, padding:8, display:'flex', flexDirection:'column', gap:2}}>
              <b style={{fontSize:11}}>🛣️ Khảo sát tuyến</b>
              <div>Tình trạng: <b>{item.survey.road || 'MISSING'}</b></div>
              <div>Mặt đường: <b>{item.survey.surface || 'MISSING'}</b></div>
              <div>Tiếp cận mùa vụ: <b>{item.survey.seasonal || 'MISSING'}</b></div>
              <div>Giới hạn xe: <b>{item.survey.vehicleLimit != null ? `${item.survey.vehicleLimit} tấn` : 'MISSING'}</b></div>
              <div style={{color:'#64748B', fontSize:11}}>Nguồn: {item.survey.source || 'MISSING'}{item.survey.verified ? ` · xác minh ${item.survey.verified}` : ''}</div>
            </div>
          )}
          {item.fire && <div>🕒 {item.fire.date || ''}{item.fire.confidence ? ` · tin cậy ${item.fire.confidence}` : ''}</div>}
          <div style={{color:'#64748B', fontSize:11}}>📍 {Number(item.lat).toFixed(4)}, {Number(item.lon).toFixed(4)}</div>
        </div>
        {dg && (
          <div style={{background:'#F8FAFC', borderRadius:8, padding:8}}>
            {dg.loading && <span style={{color:'#64748B'}}>⏳ Đang chẩn đoán…</span>}
            {dg.error && !dg.loading && <span style={{color:'#B45309'}}>{dg.error}</span>}
            {!dg.loading && !dg.error && <>
              {dg.level && <div>Cấp cháy <b>CẤP {dg.level}</b>{dg.label ? ` · ${dg.label}` : ''}</div>}
              {dg.driver && <div>⚠ <b>{dg.driver}</b></div>}
              {dg.action && <div>✅ {dg.action}</div>}
              <div style={{color:'#64748B', fontSize:11, marginTop:2}}>Độ phủ: {dg.coverage || 'MISSING'}</div>
              {dg.sigs && <div style={{fontSize:11, marginTop:2}}>🛡️ {dg.sigs}</div>}
              {dg.missing && <div style={{fontSize:10, color:'#B45309', marginTop:2}}>Thiếu: {dg.missing}</div>}
              {dg.brief && <div style={{fontSize:11, marginTop:2}}>📋 {dg.brief}</div>}
              {dg.thumbUrl && <img src={dg.thumbUrl} alt={`Ảnh vệ tinh ${item.name}`} loading="lazy" style={{width:'100%', borderRadius:8, marginTop:6, display:'block'}} />}
              {dg.level && onForecast && <div><button onClick={()=> onForecast(item)} style={{marginTop:6, background:'#0F766E', color:'#fff', border:0, borderRadius:999, padding:'6px 12px', fontSize:11, fontWeight:700, cursor:'pointer'}}>📋 Bản tin dự báo CẤP</button></div>}
            </>}
          </div>
        )}
        {expanded && (
          <div style={{background:'#F8FAFC', borderRadius:8, padding:8, display:'flex', flexDirection:'column', gap:3}}>
            <div>Loại: <b>{item.typeLabel}</b> ({item.kind})</div>
            {dg?.firms != null && <div>FIRMS lân cận: <b>{dg.firms}</b></div>}
            {dg?.temp != null && <div>Nhiệt độ: <b>{dg.temp}°C</b></div>}
            {(dg?.rain14 != null || dg?.dryDays != null) && <div>Mưa 14 ngày: <b>{dg.rain14 ?? '?'}mm</b> · khô <b>{dg.dryDays ?? '?'} ngày</b></div>}
            {dg?.watch && <div>Theo dõi: {dg.watch}</div>}
            {item.viewer && <div>Xác minh ảnh: <b>{item.viewer.verification_status || '?'}</b></div>}
          </div>
        )}
        <div id="drawer-photos">
          <b style={{fontSize:12}}>🖼 Ảnh xác minh</b>
          {photosState === 'loading' && <div style={{fontSize:11, color:'#64748B', marginTop:4}}>Đang tìm ảnh quanh đây…</div>}
          {photosState === 'done' && photos.length === 0 && <div style={{fontSize:11, color:'#64748B', marginTop:4}}>Chưa có dữ liệu hình ảnh xác minh</div>}
          {photos.length > 0 && <div style={{display:'flex', gap:6, marginTop:6, flexWrap:'wrap'}}>
            {photos.map((p, i)=> <a key={i} href={p.url} target="_blank" rel="noreferrer"><img src={p.thumb} alt={`Ảnh thực địa ${i + 1} gần ${item.name}`} loading="lazy" style={{width:96, height:72, objectFit:'cover', borderRadius:8, border:'1px solid #E2E8E5'}} /></a>)}
          </div>}
        </div>
        <ViewerBlock viewer={item.viewer} assetId={item.assetId} />
        {/* P11 response liên quan — AI Alert → Asset → Response Plan → Action, mỗi bước 1 click */}
        <div>
          <b style={{fontSize:12}}>🚒 Response liên quan</b>
          <div style={{display:'flex', gap:6, marginTop:6, flexWrap:'wrap'}}>
            <Link to={`/firesim?lat=${item.lat}&lon=${item.lon}`} style={plink}>🔥 FireSim tại điểm</Link>
            <Link to="/command" style={plink}>🎖️ Command Center</Link>
          </div>
        </div>
        {nearby.length > 0 && (
          <div>
            <b style={{fontSize:12}}>Xung quanh (≤5km)</b>
            {nearby.map(g=> (
              <div key={g.group} style={{marginTop:4}}>
                <div style={{fontSize:10, fontWeight:800, color:'#64748B', letterSpacing:0.4}}>{g.group.toUpperCase()}</div>
                {g.items.map(it=> (
                  <button key={it.key} onClick={()=> onSelect(it.key)} title={`Mở ${it.name}`}
                    style={{display:'flex', gap:6, width:'100%', textAlign:'left', background:'transparent', border:0, borderBottom:'1px solid #F1F5F9', padding:'4px 0', fontSize:12, cursor:'pointer'}}>
                    <span>{it.icon}</span><span style={{flex:1}}>{it.name}</span><span style={{color:'#64748B'}}>{it.distKm.toFixed(1)}km</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
      <style>{`@media (max-width: 640px){
        .asset-drawer{ top:auto !important; left:0 !important; right:0 !important; bottom:46px !important; width:auto !important; max-height:46vh; border-radius:16px 16px 0 0 !important; }
      }`}</style>
    </div>
  )
}

const abtn: React.CSSProperties = { border:'1px solid #E2E8E5', background:'#fff', borderRadius:999, padding:'5px 12px', fontSize:11, fontWeight:700, cursor:'pointer', color:'#0B1412', transition:'background-color .15s ease' }
const plink: React.CSSProperties = { border:'1px solid #E2E8E5', background:'#F8FAFC', borderRadius:999, padding:'5px 12px', fontSize:11, fontWeight:700, color:'#0F766E', textDecoration:'none' }
