import { useState, useEffect } from 'react'

const LEVELS = [
  { lv:'I', label:'ÍT NGUY CƠ', color:'#10B981' },
  { lv:'II', label:'NGUY CƠ TRUNG BÌNH', color:'#84CC16' },
  { lv:'III', label:'NGUY CƠ CAO', color:'#F59E0B' },
  { lv:'IV', label:'NGUY HIỂM', color:'#F97316' },
  { lv:'V', label:'CỰC KỲ NGUY HIỂM', color:'#DC2626' },
]

export function FireWarningGauge({ level = 'IV', onSelect }: { level:string; onSelect?:(lv:string)=>void }){
  const idx = LEVELS.findIndex(l=> l.lv===level)
  const pct = ((idx+0.5)/5)*100
  return (
    <div style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:16, padding:16}}>
      <div style={{fontWeight:800, fontSize:12, letterSpacing:0.6}}>CẤP CẢNH BÁO CHÁY RỪNG</div>
      <div style={{position:'relative', height:36, marginTop:12, background:'#F1F5F3', borderRadius:999, display:'flex'}}>
        {LEVELS.map(l=>(
          <div key={l.lv} onClick={()=>onSelect?.(l.lv)} style={{flex:1, display:'grid', placeItems:'center', fontSize:11, fontWeight:700, cursor:'pointer', color: LEVELS[idx].lv===l.lv ? '#fff' : '#0B1412', zIndex:1}}>{l.lv}</div>
        ))}
        <div style={{position:'absolute', left:`calc(${pct}% - 18px)`, top:-8, transition:'left 600ms cubic-bezier(0.16,1,0.3,1)'}}>
          <div style={{width:36, height:36, background:'#0B1412', color:'#fff', borderRadius:999, display:'grid', placeItems:'center', fontSize:11, fontWeight:800, boxShadow:'0 4px 12px rgba(0,0,0,0.2)'}}>▲</div>
          <div style={{textAlign:'center', fontSize:10, fontWeight:700, marginTop:2}}>{level}</div>
        </div>
        <div style={{position:'absolute', inset:0, display:'flex', borderRadius:999, overflow:'hidden', opacity:0.18}}>
          {LEVELS.map(l=> <div key={l.lv} style={{flex:1, background:l.color}}/>)}
        </div>
      </div>
      <div style={{display:'flex', justifyContent:'space-between', fontSize:10, color:'#64748B', marginTop:6}}>
        <span>I</span><span>II</span><span>III</span><span>IV</span><span>V</span>
      </div>
      <div style={{marginTop:10, fontSize:12, background:'#FFF7ED', border:'1px solid #FDBA74', borderRadius:10, padding:8}}>
        <b>{LEVELS[idx]?.label}</b> — {idx>=3 ? 'Cần tăng cường giám sát thực địa' : 'Theo dõi thường xuyên'}
      </div>
    </div>
  )
}

export function FireWarningCard({ level='IV', risk=82, confidence=91, temp=35, humidity=31, rainfall=0, wind=21, vegetation='VERY DRY', hotspots=2 }:{ level?:string; risk?:number; confidence?:number; temp?:number; humidity?:number; rainfall?:number; wind?:number; vegetation?:string; hotspots?:number }){
  const info = LEVELS.find(l=> l.lv===level) || LEVELS[3]
  return (
    <div style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:16, padding:16, boxShadow:'0 4px 16px rgba(15,30,26,0.06)'}}>
      <div style={{display:'flex', gap:10, alignItems:'center'}}>
        <div style={{width:48, height:48, borderRadius:12, background:info.color, display:'grid', placeItems:'center', fontSize:20}}>🔥</div>
        <div>
          <div style={{fontSize:12, letterSpacing:0.6, fontWeight:800, color:'#DC2626'}}>FOREST FIRE WARNING</div>
          <div style={{fontSize:22, fontWeight:800}}>{level} · {info.label}</div>
        </div>
        {level==='IV' || level==='V' ? <span style={{marginLeft:'auto', background:'#FEE2E2', color:'#991B1B', padding:'4px 8px', borderRadius:999, fontSize:11, fontWeight:700}}>HIGH PRIORITY</span> : null}
      </div>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:12, fontSize:13}}>
        <div>AI Risk <b>{risk}/100</b></div><div>Tin cậy <b>{confidence}%</b></div>
        <div>Nhiệt độ <b>{temp}°C</b></div><div>Ẩm <b>{humidity}%</b></div>
        <div>Mưa <b>{rainfall} mm</b></div><div>Gió <b>{wind} km/h</b></div>
        <div>Thực bì <b>{vegetation}</b></div><div>FIRMS <b>{hotspots} điểm</b></div>
      </div>
      <div style={{display:'flex', gap:8, marginTop:12}}>
        <button style={{flex:1, background:'#0F766E', color:'#fff', border:0, padding:'8px', borderRadius:999, fontSize:13, fontWeight:600}}>Phân tích AI</button>
        <button style={{flex:1, background:'#fff', border:'1px solid #E2E8E5', padding:'8px', borderRadius:999, fontSize:13}}>Mô phỏng</button>
        <button style={{flex:1, background:'#0B1412', color:'#fff', border:0, padding:'8px', borderRadius:999, fontSize:13}}>Tạo nhiệm vụ</button>
      </div>
    </div>
  )
}

export function FireIntelligencePanel({ official, ai, discrepancy }:{ official?:any; ai?:any; discrepancy?:boolean }){
  const [level, setLevel] = useState('IV')
  const [detail, setDetail] = useState<any>(null)
  useEffect(()=>{ if(level==='IV') setDetail({meaning:'Rừng dễ cháy, thời tiết khô nóng, gió mạnh', conditions:'Nhiệt cao, ẩm thấp, NDMI giảm 29%', actions:['Tăng giám sát','Kiểm tra điểm nóng','Chuẩn bị nhiệm vụ']}) },[level])
  return (
    <div style={{display:'flex', flexDirection:'column', gap:12}}>
      <FireWarningGauge level={level} onSelect={setLevel} />
      {detail && (
        <div style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:16, padding:16}}>
          <h4>CẤP {level} — {LEVELS.find(l=>l.lv===level)?.label}</h4>
          <div style={{fontSize:13, color:'#334155'}}><b>Ý nghĩa:</b> {detail.meaning}<br/><b>Điều kiện:</b> {detail.conditions}</div>
          <div style={{marginTop:8, fontSize:13}}><b>Bằng chứng AI:</b> Vệ tinh · Thời tiết · FIRMS · Địa hình</div>
          <div style={{marginTop:8, display:'flex', gap:6}}>
            {detail.actions.map((a:string)=><span key={a} style={{background:'#F1F5F3', padding:'4px 8px', borderRadius:999, fontSize:11}}>{a}</span>)}
          </div>
          <div style={{fontSize:11, color:'#64748B', marginTop:8}}>Nguồn chính thức: UBND Tỉnh Gia Lai · Cập nhật: vừa xong</div>
        </div>
      )}
      {discrepancy && (
        <div style={{background:'#FEF3C7', border:'1px solid #FDBA74', borderRadius:12, padding:12, fontSize:13}}>
          <b>⚠ SIGNAL DISCREPANCY</b><br/>Chính thức: {official?.level} · AI: {ai?.level}<br/>Lý do: Độ khô thực bì tăng nhanh<br/>Khuyến nghị: Rà soát / Xác minh
        </div>
      )}
    </div>
  )
}
