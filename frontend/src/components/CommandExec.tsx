// Executive Command Center blocks — presentational only.
// No new engines, AI, layers, APIs, scores or indices: everything renders
// from state the Command page already holds (alerts, assets, plan).
// Goal: threat level + main driver + required action + threatened
// communities + operational readiness readable within 5 seconds.
import { useEffect, useState } from 'react'
import FireRiskGauge from './FireRiskGauge'

export function levelTone(level: string | undefined): 'red' | 'orange' | 'amber' | 'calm' {
  const l = String(level || '')
  if(/CRITICAL|\bV\b|CẢNH BÁO/.test(l)) return 'red'
  if(/IV/.test(l)) return 'orange'
  if(/III|WARNING|HIGH/.test(l)) return 'amber'
  return 'calm'
}

const TONE: Record<string, { bg: string; fg: string; chip: string }> = {
  red: { bg: '#FEF2F2', fg: '#991B1B', chip: '#DC2626' },
  orange: { bg: '#FFF7ED', fg: '#9A3412', chip: '#EA580C' },
  amber: { bg: '#FFFBEB', fg: '#92400E', chip: '#D97706' },
  calm: { bg: '#F0FDF4', fg: '#166534', chip: '#16A34A' },
}

function worstAlert(alerts: any[]){
  const rank = (l: string) => levelTone(l) === 'red' ? 0 : levelTone(l) === 'orange' ? 1 : levelTone(l) === 'amber' ? 2 : 3
  return [...alerts].sort((a, b)=> rank(a?.level) - rank(b?.level))[0] || null
}
export { worstAlert }

// P3 Command Brief — một khối text cực ngắn (≤70 từ), chỉ từ state sẵn có.
export function buildBrief(plan: any, alerts: any[], firmsCount: number): string {
  const top = worstAlert(alerts)
  const level = plan?.risk_summary?.level || top?.level
  const driver = plan?.earth_intelligence?.major_risk_driver
  const comms: any[] = plan?.threatened_communities || []
  const focus = comms[0]?.commune || top?.title || top?.administrative_unit_id
  const action = plan?.top_actions?.[0]
  const parts: string[] = []
  parts.push(level ? `CẤP ${level}.` : 'Chưa có cấp cảnh báo.')
  parts.push(firmsCount > 0 ? `Có ${firmsCount} điểm nóng FIRMS.` : 'Không phát hiện điểm nóng FIRMS.')
  if(driver) parts.push(`Nguyên nhân chính: ${driver}.`)
  if(focus) parts.push(`${focus} là khu vực cần chú ý nhất.`)
  parts.push(`Khuyến nghị: ${action ? `${action.action || ''} ${action.title || action.detail || ''}`.trim() : 'lập kế hoạch tác chiến'}.`)
  return parts.join(' ')
}

// P8 Mission Board — tối đa 5 nhiệm vụ từ plan/alerts sẵn có (động từ cố định).
export function buildMissions(plan: any, alerts: any[]): string[] {
  const out: string[] = []
  for(const t of (plan?.top_actions || []).slice(0, 3)){
    const s = `${t.action || 'Thực hiện'}: ${t.title || t.detail || ''}`.trim()
    if(s.replace(/[:\s]/g, '')) out.push(s)
  }
  const topComm = plan?.threatened_communities?.[0]?.commune
  if(topComm && out.length < 5) out.push(`Theo dõi ${topComm}`)
  const route = plan?.primary_route?.route_name
  if(route && out.length < 5) out.push(`Giữ ${route} thông suốt`)
  if(!plan){
    for(const a of alerts.slice(0, 3)){
      if(out.length >= 4) break
      const s = a.title || a.administrative_unit_id || a.id
      if(s) out.push(`Theo dõi ${s}`)
    }
    if(out.length < 5) out.push('Lập kế hoạch tác chiến cho điểm nóng nhất')
  }
  return out.slice(0, 5)
}

// 1. Executive Alert Strip — one glance: how bad, where, what now.
export function ExecutiveAlertStrip({ alerts, plan, planLoading, onPlan }: {
  alerts: any[]; plan: any; planLoading: boolean; onPlan: (a: any)=>void;
}){
  const top = worstAlert(alerts)
  const level = plan?.risk_summary?.level || top?.level || null
  const t = levelTone(level)
  const s = TONE[level ? t : 'calm']
  // P8: xã ưu tiên = xã đầu trong threatened (không thêm chỉ số mới).
  const topComm = plan?.threatened_communities?.[0]?.commune || null
  const place = topComm || plan?._title || top?.title || top?.administrative_unit_id || ''
  const action = plan?.top_actions?.[0] || plan?.deployment_plan?.[0] || null
  return (
    <div role="status" style={{background:s.bg, color:s.fg, border:`1px solid ${s.chip}`, borderRadius:12, padding:'10px 14px', display:'flex', gap:12, alignItems:'center', flexWrap:'wrap'}}>
      <span style={{background:s.chip, color:'#fff', fontWeight:800, fontSize:13, borderRadius:999, padding:'4px 14px', whiteSpace:'nowrap'}}>
        {level ? `MỨC ${level}` : 'KHÔNG CÓ CẢNH BÁO'}
      </span>
      <span style={{fontSize:13, fontWeight:700, flex:'1 1 200px', minWidth:0}}>
        {place || 'Hệ thống vẫn giám sát'}
        {plan?.earth_intelligence?.major_risk_driver && <> · do <b>{plan.earth_intelligence.major_risk_driver}</b></>}
      </span>
      {action
        ? <span style={{fontSize:12}}>▶ <b>{action.action ? `${action.action}: ` : ''}{action.title || action.detail}</b></span>
        : top && <button onClick={()=> onPlan(top)} disabled={planLoading} style={{fontSize:12, fontWeight:800, borderRadius:999, border:0, background:s.chip, color:'#fff', padding:'6px 14px', cursor:'pointer'}}>
            {planLoading ? 'Đang lập…' : 'Lập kế hoạch'}
          </button>}
    </div>
  )
}

// 2. Command Summary Card — the 5 answers, no metrics-first clutter.
export function CommandSummaryCard({ alerts, assets, plan }: {
  alerts: any[]; plan: any; assets: any[];
}){
  const top = worstAlert(alerts)
  const level = plan?.risk_summary?.level || top?.level || null
  const t = levelTone(level)
  const s = TONE[level ? t : 'calm']
  const comms: any[] = plan?.threatened_communities || []
  const waters = assets.filter(a=> a.asset_type === 'water' && a.status === 'active')
  const stations = assets.filter(a=> ['station', 'team'].includes(a.asset_type) && a.status === 'active')
  const rows: [string, React.ReactNode][] = [
    ['Mức đe dọa', level ? <b style={{color:s.chip}}>MỨC {level}{plan?._title ? ` — ${plan._title}` : top?.title ? ` — ${top.title}` : ''}</b> : 'Không có cảnh báo ACTIVE'],
    ['Nguyên nhân chính', plan?.earth_intelligence?.major_risk_driver || top?.risk_type || 'Chưa xác định — lập kế hoạch để phân tích driver'],
    ['Hành động', plan?.top_actions?.[0]
      ? <b>{plan.top_actions[0].action}: {plan.top_actions[0].title} ({plan.top_actions[0].unit || 'MISSING'})</b>
      : (top ? 'Bấm “Lập kế hoạch” ở dải trên để sinh phương án' : 'Theo dõi định kỳ')],
    ['Xã bị đe dọa', comms.length
      ? <>{comms.length} xã: <b>{comms.slice(0, 4).map((c:any)=> c.commune).join(', ')}</b>{comms.length > 4 && ` +${comms.length - 4}`}</>
      : (top ? (top.administrative_unit_id || 'Đang xác định') : 'Không có')],
    ['Sẵn sàng', <>{plan?.primary_water ? <>💧 <b>{plan.primary_water.name}</b> ({plan.primary_water.distance_km} km)</> : `💧 ${waters.length} nguồn nước`} · {plan?.primary_station ? <>🏕️ <b>{plan.primary_station.station_name}</b></> : `🏕️ ${stations.length} trạm/tổ`} · 🛣️ {plan?.primary_route ? <b>{plan.primary_route.route_name}</b> : 'chưa chọn tuyến'}</>],
  ]
  return (
    <div style={{background:'#fff', border:`2px solid ${level ? s.chip : '#E2E8E5'}`, borderRadius:12, padding:12, display:'flex', flexDirection:'column', gap:6}}>
      <b style={{fontSize:13}}>📋 Tóm tắt chỉ huy</b>
      {rows.map(([k, v])=> (
        <div key={k} style={{display:'flex', gap:8, fontSize:12, borderTop:'1px solid #F1F5F9', paddingTop:6}}>
          <span style={{color:'#64748B', minWidth:110, flex:'none'}}>{k}</span><span>{v}</span>
        </div>
      ))}
    </div>
  )
}

// 3. Situation Board — threatened communities + resource readiness detail.
export function SituationBoard({ plan, alerts, large, hideHero }: {
  plan: any; alerts: any[]; large?: boolean; hideHero?: boolean;
}){
  const comms: any[] = (plan?.threatened_communities || []).slice(0, 6)
  const units = comms.length ? comms : alerts.slice(0, 6).map((a:any)=> ({
    commune: a.title || a.administrative_unit_id || a.id, band: a.level || '—', eta_hours: null,
  }))
  const fs = large ? 15 : 12
  return (
    <div style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:12, padding:12}}>
      {!hideHero && <AttentionHero plan={plan} alerts={alerts} large={large} />}
      <b style={{fontSize: large ? 16 : 13}}>🗺️ Bảng tình hình {comms.length ? `(${plan.threatened_communities.length} xã)` : '(từ cảnh báo)'}</b>
      {units.length === 0 && <div style={{fontSize:fs, color:'#64748B', marginTop:6}}>Không có xã nào bị đe dọa.</div>}
      {units.map((c:any)=> (
        <div key={c.code || c.commune} style={{display:'flex', gap:8, alignItems:'center', fontSize:fs, borderTop:'1px solid #F1F5F9', padding:'6px 0', transition:'background-color 250ms cubic-bezier(0.16,1,0.3,1)'}}>
          <b style={{flex:1}}>{c.commune}</b>
          <span style={{fontWeight:800, transition:'color 250ms cubic-bezier(0.16,1,0.3,1)'}}>{c.band}</span>
          {c.eta_hours != null && <span style={{color:'#64748B'}}>~{c.eta_hours}h</span>}
          {c.shield && <span title="Community Shield" style={{color:'#0F766E'}}>🛡️{c.shield}</span>}
        </div>
      ))}
      {plan && (
        <div style={{fontSize: large ? 13 : 11, color:'#64748B', marginTop:6, borderTop:'1px solid #F1F5F9', paddingTop:6}}>
          Nước: <b>{plan.primary_water?.name || '—'}</b>{plan.backup_water && <> · dự phòng <b>{plan.backup_water.name}</b></>} ·
          Trạm: <b>{plan.primary_station?.station_name || '—'}</b> ·
          Tuyến: <b>{plan.primary_route?.route_name || '—'}</b>
        </div>
      )}
    </div>
  )
}

// P4 Attention System — mỗi lúc 1 điểm chú ý lớn nhất: khu vực + band + ETA.
export function AttentionHero({ plan, alerts, large, dark }: {
  plan: any; alerts: any[]; large?: boolean; dark?: boolean;
}){
  const c: any = plan?.threatened_communities?.[0]
  const top = !c ? worstAlert(alerts) : null
  if(!c && !top) return null
  const name = c?.commune || top?.title || top?.administrative_unit_id
  const band = c?.band || top?.level || '—'
  const eta = c?.eta_hours
  const t = levelTone(band)
  const s = TONE[t]
  return (
    <div key={name} className="anim-fade" style={{background: dark ? '#111827' : s.bg, border:`2px solid ${s.chip}`, borderRadius:12,
      padding: large ? '16px 20px' : '10px 14px', marginBottom:10}}>
      <div style={{fontSize: large ? 14 : 11, fontWeight:800, color: dark ? '#FCA5A5' : s.fg, letterSpacing:0.6}}>⚠ KHU VỰC ƯU TIÊN</div>
      <div style={{display:'flex', gap:10, alignItems:'baseline', flexWrap:'wrap', marginTop:2}}>
        <b style={{fontSize: large ? 30 : 20, color: dark ? '#fff' : s.fg}}>{name}</b>
        <span style={{background:s.chip, color:'#fff', fontWeight:800, fontSize: large ? 16 : 13, borderRadius:999, padding:'2px 12px'}}>{band}</span>
        {eta != null && <span style={{fontSize: large ? 15 : 12, color: dark ? '#D1D5DB' : s.fg}}>ETA ~{eta} giờ</span>}
      </div>
    </div>
  )
}

// P2 Executive Header — 6 facts, không cần mở panel.
export function ExecutiveHeader({ level, firmsCount, communes, topCommune, waterName, stationName, actionText, large, dark }: {
  level?: string | null; firmsCount: number; communes: string[]; topCommune?: string | null;
  waterName?: string | null; stationName?: string | null; actionText?: string | null;
  large?: boolean; dark?: boolean;
}){
  const t = levelTone(level || undefined)
  const s = TONE[level ? t : 'calm']
  const fs = large ? 16 : 12
  const chip = (label: string, value: React.ReactNode) => (
    <span key={label} style={{fontSize:fs, background: dark ? '#111827' : '#fff', border:`1px solid ${dark ? '#374151' : '#E2E8E5'}`,
      borderRadius:999, padding: large ? '8px 18px' : '5px 12px', whiteSpace:'nowrap', color: dark ? '#F9FAFB' : '#0B1412'}}>
      {label} <b>{value}</b>
    </span>
  )
  return (
    <div style={{display:'flex', gap:8, flexWrap:'wrap', alignItems:'center',
      background: dark ? 'transparent' : s.bg, border: dark ? 'none' : `1px solid ${s.chip}`,
      borderRadius:12, padding: large ? '14px 18px' : '8px 12px'}}>
      <span style={{background:s.chip, color:'#fff', fontWeight:800, fontSize: large ? 18 : 14, borderRadius:999, padding: large ? '8px 20px' : '4px 14px', whiteSpace:'nowrap'}}>
        🔥 {level ? `CẤP ${level}` : 'ỔN ĐỊNH'}
      </span>
      {chip('📡 FIRMS', firmsCount)}
      {chip('🏘 Xã', communes.length ? `${communes.length}${topCommune ? ` · ${topCommune}` : ''}` : '—')}
      {chip('💧 Nước', waterName || '—')}
      {chip('🏕 Trạm', stationName || '—')}
      {chip('⚠ Hành động', actionText || '—')}
    </div>
  )
}

// P3 + P8 — brief cực ngắn và bảng nhiệm vụ (≤5).
export function CommandBrief({ text, large, dark }: { text: string; large?: boolean; dark?: boolean }){
  return (
    <div style={{background: dark ? '#111827' : '#fff', border:`1px solid ${dark ? '#374151' : '#E2E8E5'}`,
      borderRadius:12, padding: large ? '20px 24px' : '12px 14px'}}>
      <b style={{fontSize: large ? 15 : 12, color: dark ? '#9CA3AF' : '#64748B', letterSpacing:0.6}}>📢 BẢN TIN CHỈ HUY</b>
      <div style={{fontSize: large ? 24 : 14, lineHeight:1.6, marginTop:6, color: dark ? '#F9FAFB' : '#0B1412'}}>{text}</div>
    </div>
  )
}

export function MissionBoard({ missions, tone }: { missions: string[]; tone?: string }){
  const c = tone && (TONE as any)[tone] ? (TONE as any)[tone].chip : '#0F766E'
  return (
    <div style={{background:'#fff', border:`1px solid ${c}`, borderRadius:12, padding:12}}>
      <b style={{fontSize:13}}>🎯 NHIỆM VỤ ({missions.length})</b>
      {missions.length === 0 && <div style={{fontSize:12, color:'#64748B', marginTop:6}}>Chưa có nhiệm vụ.</div>}
      {missions.map((m, i)=> (
        <div key={i} style={{display:'flex', gap:8, fontSize:12, borderTop:'1px solid #F1F5F9', padding:'6px 0'}}>
          <b style={{color:c}}>{i + 1}.</b><span>{m}</span>
        </div>
      ))}
    </div>
  )
}

// Kế hoạch rút gọn cho Wall Mode (tái dùng field plan sẵn có).
function PlanDigest({ plan, large }: { plan: any; large?: boolean }){
  const fs = large ? 20 : 13
  if(!plan) return <div style={{fontSize:fs, color:'#9CA3AF'}}>Chưa có kế hoạch — đang lập theo điểm nóng nhất…</div>
  return (
    <div style={{display:'flex', flexDirection:'column', gap: large ? 14 : 8, fontSize:fs, color:'#F9FAFB'}}>
      <div>💧 <b>{plan.primary_water?.name || '—'}</b> · 🏕️ <b>{plan.primary_station?.station_name || '—'}</b> · 🛣️ <b>{plan.primary_route?.route_name || '—'}</b></div>
      {(plan.top_actions || []).slice(0, 3).map((a:any, i:number)=> (
        <div key={i}>▶ <b>{a.action}: {a.title}</b> — {a.unit || 'MISSING'}</div>
      ))}
      {(plan.deployment_plan || []).slice(0, 2).map((d:any, i:number)=> (
        <div key={`d${i}`} style={{color:'#D1D5DB'}}>• {d.detail}</div>
      ))}
    </div>
  )
}

// P1 Wall Mode — màn 55–75": tự xoay 5 slide, font lớn, nền tối ops-center.
// Không click cũng chạy; dots để nhảy slide (a11y).
const SLIDES: [string, string][] = [
  ['forecast', '🔥 DỰ BÁO'], ['situation', '⚠ TÌNH HÌNH'], ['communities', '🏘 CỘNG ĐỒNG'],
  ['plan', '🚒 KẾ HOẠCH'], ['brief', '📢 BẢN TIN'],
]
export function WallMode({ alerts, plan, planLoading, firmsCount, onPlan, onExit }: {
  alerts: any[]; plan: any; planLoading: boolean; firmsCount: number;
  onPlan: (a: any)=>void; onExit: ()=>void;
}){
  const [idx, setIdx] = useState(0)
  const [now, setNow] = useState(new Date())
  useEffect(()=>{
    const id = setInterval(()=> setIdx(i=> (i + 1) % SLIDES.length), 8000)
    return ()=> clearInterval(id)
  },[idx])
  useEffect(()=>{
    const id = setInterval(()=> setNow(new Date()), 1000)
    return ()=> clearInterval(id)
  },[])
  useEffect(()=>{
    if(!plan && !planLoading && alerts.length) onPlan(worstAlert(alerts))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[])
  const level = plan?.risk_summary?.level || worstAlert(alerts)?.level || null
  const comms: string[] = (plan?.threatened_communities || []).map((c:any)=> c.commune)
  const topComm = comms[0] || null
  const action = plan?.top_actions?.[0]
  const brief = buildBrief(plan, alerts, firmsCount)
  const [key, label] = SLIDES[idx]
  return (
    <div style={{position:'fixed', inset:0, zIndex:100, background:'#0B1412', color:'#F9FAFB',
      display:'flex', flexDirection:'column', padding:'20px 28px', gap:14, overflow:'auto'}}>
      <div style={{display:'flex', gap:12, alignItems:'center'}}>
        <b style={{fontSize:22}}>TRUNG TÂM CHỈ HUY · GIA LAI</b>
        <span style={{fontSize:16, color:'#9CA3AF'}}>{now.toLocaleTimeString('vi-VN')}</span>
        <span style={{flex:1}} />
        <div style={{display:'flex', gap:6}}>
          {SLIDES.map(([k, l], i)=> (
            <button key={k} onClick={()=> setIdx(i)} title={l}
              style={{width:14, height:14, borderRadius:999, border:0, cursor:'pointer', background: i === idx ? '#fff' : '#374151', transition:'background-color .15s ease'}} />
          ))}
        </div>
        <button onClick={onExit} style={{fontSize:14, fontWeight:800, borderRadius:999, border:'1px solid #374151', background:'transparent', color:'#fff', padding:'8px 18px', cursor:'pointer', transition:'background-color .15s ease'}}>✕ Thoát Wall</button>
      </div>
      <ExecutiveHeader level={level} firmsCount={firmsCount}
        communes={comms.length ? comms : alerts.map((a:any)=> a.title || a.administrative_unit_id).filter(Boolean).slice(0, 4)}
        topCommune={topComm} waterName={plan?.primary_water?.name} stationName={plan?.primary_station?.station_name}
        actionText={action ? `${action.action}: ${action.title}` : (planLoading ? 'Đang lập kế hoạch…' : null)}
        large dark />
      <div style={{fontSize:20, fontWeight:800, color:'#9CA3AF', letterSpacing:1}}>{label}</div>
      <div key={key} className="anim-fade" style={{flex:1, minHeight:0, overflow:'auto'}}>
        {key === 'forecast' && <div style={{maxWidth:900}}><FireRiskGauge /></div>}
        {key === 'situation' && <AttentionHero plan={plan} alerts={alerts} large dark />}
        {key === 'communities' && <div style={{maxWidth:1000}}><SituationBoard plan={plan} alerts={alerts} large /></div>}
        {key === 'plan' && <PlanDigest plan={plan} large />}
        {key === 'brief' && <CommandBrief text={brief} large dark />}
      </div>
    </div>
  )
}
