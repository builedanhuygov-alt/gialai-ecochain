import MapView from '../components/MapView'
import { Tabs } from '../components/Tabs'
import { FireWarningCard, FireIntelligencePanel } from '../components/FireComponents'
import { useEffect, useState } from 'react'
import { API_BASE } from '../services/api'
const API = API_BASE

const TAB2TYPE: Record<string, string> = { 'Cháy':'FIRE', 'Ngập':'FLOOD', 'Hạn':'DROUGHT', 'Bão':'STORM', 'Sạt lở':'LANDSLIDE' }
const TYPE_VI: Record<string, string> = { FIRE:'Cháy', FLOOD:'Ngập', DROUGHT:'Hạn', STORM:'Bão', LANDSLIDE:'Sạt lở', HEAT:'Nắng nóng' }

export default function Disaster(){
  const [fire, setFire]= useState<any>(null)
  const [official, setOfficial]= useState<any>(null)
  const [tab, setTab] = useState('Cháy')
  const [summary, setSummary] = useState<any>(null)
  useEffect(()=>{
    fetch(`${API}/api/fire/risk?administrative_unit_id=GiaLai&lat=13.9&lon=108.3`).then(r=>r.json()).then(j=> setFire(j)).catch(()=>{})
    fetch(`${API}/api/fire/warnings`).then(r=>r.json()).then(j=> setOfficial(j[0])).catch(()=>{})
    fetch(`${API}/api/disaster/summary?administrative_unit_id=GiaLai&lat=13.9&lon=108.3`).then(r=>r.json()).then(j=> setSummary(j)).catch(()=>{})
  },[])
  const sig = (summary?.signals || []).find((s:any)=> s.risk_type === TAB2TYPE[tab])
  return (
    <div className="page">
      <h1>AI Thiên tai — {tab === 'Cháy' ? 'Trí tuệ Lửa Rừng' : `Trí tuệ ${tab}`}</h1>
      <Tabs tabs={['Cháy','Ngập','Hạn','Bão','Sạt lở']} defaultTab="Cháy" onSelect={setTab} />
      <div style={{height:12}} />
      <div style={{display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:14}} className="dis-grid">
        <MapView />
        <div style={{display:'flex', flexDirection:'column', gap:12}}>
          {tab === 'Cháy' ? (
            <FireWarningCard level={fire?.warning_level || 'IV'} risk={fire?.risk_score ?? 82} confidence={fire?.confidence ?? 91} temp={fire?.elevation ? 35 : 35} />
          ) : (
            <div className="card" style={{borderLeft:`4px solid ${sig && sig.score > 60 ? '#DC2626' : '#0F766E'}`}}>
              <b>{TYPE_VI[sig?.risk_type] || tab}: {sig ? `${sig.score}/100` : 'đang tải...'}</b>
              <div style={{fontSize:12, color:'#64748B', marginTop:4}}>DisasterGuard · {summary ? 'LIVE' : 'đang tải...'}</div>
            </div>
          )}
          <FireIntelligencePanel official={official} ai={fire} discrepancy={!!(fire && official && fire.warning_level!==official.level)} />
        </div>
      </div>
      <div className="grid">
        <div className="card"><b>Đa thiên tai Gia Lai</b> — {(summary?.signals || []).map((s:any)=> `${TYPE_VI[s.risk_type] || s.risk_type} ${s.score}`).join(' · ') || 'đang tải...'} <br/><small>Nguồn: DisasterGuard · {summary?.status || '…'}</small></div>
        <div className="card">Forecast + AI Recommendations — Early warning 72h</div>
      </div>
      <style>{`.tabs{display:flex; gap:8px} .tabs span{padding:6px 10px; border-radius:999px; background:#F1F5F3; font-size:13px} .tabs .active{background:#0B1412; color:#fff} .grid{display:grid; grid-template-columns:1fr 1fr; gap:14px} .card{background:#fff; border:1px solid #E2E8E5; border-radius:12px; padding:16px} @media (max-width: 900px){ .dis-grid{ grid-template-columns:1fr !important; } .grid{ grid-template-columns:1fr; } }`}</style>
    </div>
  )
}
