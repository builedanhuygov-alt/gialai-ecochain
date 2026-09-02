import { useEffect, useState } from 'react'
import { useLocation } from '../hooks/useLocation'

export default function WeatherCard(){
  const { state, request } = useLocation()
  const [weather, setWeather] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  // auto request permission prompt state
  useEffect(()=>{
    // do not auto prompt, wait for user click Sec7
  },[])

  useEffect(()=>{
    if(state.status==='granted' && state.lat && state.lon){
      setLoading(true)
      const fetchWeather = async()=>{
        try{
          const base = import.meta.env.VITE_API_BASE || 'http://localhost:8000'
          const r = await fetch(`${base}/api/weather/current?lat=${state.lat}&lon=${state.lon}`)
          const j = await r.json()
          setWeather(j)
        }catch(e){ setWeather({ status:'DEMO DATA', current:{ temperature:'28', weathercode:2 }, humidity:74, error:String(e) })}
        setLoading(false)
      }
      fetchWeather()
    }
  },[state])

  return (
    <div className="weather-card">
      <div className="weather-head">
        <div>
          <div className="weather-title">📍 Vị trí của bạn</div>
          <div className="weather-privacy">Vị trí chỉ lưu tạm, chỉ gửi khi lấy thời tiết. Không track liên tục. <a href="#" style={{textDecoration:'underline'}}>Chính sách</a></div>
        </div>
        <span className={`badge ${weather?.metadata?.status==='LIVE' ? 'live':'demo'}`}>{weather?.metadata?.status || '—'}</span>
      </div>

      {state.status==='idle' && (
        <div className="weather-prompt">
          <p>Cần quyền vị trí để hiển thị dự báo cho vị trí hiện tại của bạn.</p>
          <button className="btn primary" onClick={request}>📍 Dùng vị trí của tôi</button>
        </div>
      )}
      {state.status==='locating' && <div className="weather-loading">Đang xác định vị trí của bạn...</div>}
      {state.status==='denied' && <div className="weather-error">{state.error} <button className="btn" onClick={request}>Thử lại</button></div>}
      {state.status==='unsupported' && <div className="weather-error">Location is not supported on this device/browser.</div>}
      {state.status==='error' && <div className="weather-error">{state.error}</div>}

      {state.status==='granted' && (
        <div className="weather-granted">
          <div className="loc">📍 Vị trí hiện tại — Lat: {state.lat} Lon: {state.lon}</div>
          {loading ? <div className="skeleton" style={{height:80}}/> : weather && (
            <div className="weather-body">
              <div className="temp">{Math.round(weather.current?.temperature ?? 28)}°C <span className="desc">{weather.current?.weathercode===1?'Quang đãng': weather.current?.weathercode===2?'Ít mây':'Có mây'}</span></div>
              <div className="details">
                <span>💧 {weather.humidity ?? 74}% độ ẩm</span>
                <span>🌧 {weather.current?.precipitation ?? 0}% mưa</span>
                <span>💨 {weather.current?.windspeed ?? 12} km/h</span>
              </div>
              <div className="forecast">Dự báo hôm nay — 12 ☀ 15 ☁ 18 🌧 21 🌧 00 ☁</div>
              <div className="meta">Nguồn: {weather.metadata?.provider || 'Open-Meteo'} · {weather.metadata?.cache_status || 'LIVE'} · Cập nhật: {new Date().toLocaleTimeString()} · <span className="source-badge">{weather.metadata?.status || 'DEMO DATA'}</span></div>
            </div>
          )}
        </div>
      )}

      <style>{`
        .weather-card{ background:#fff; border:1px solid #E2E8E5; border-radius:16px; padding:16px; }
        .weather-head{ display:flex; justify-content:space-between; align-items:flex-start; }
        .weather-title{ font-weight:800; font-size:13px; letter-spacing:0.5px; }
        .weather-privacy{ font-size:11px; color:#64748B; margin-top:4px; max-width:320px; }
        .badge{ font-size:11px; padding:4px 8px; border-radius:999px; font-weight:700; }
        .badge.live{ background:#DCFCE7; color:#166534; } .badge.demo{ background:#FEF3C7; color:#92400E; }
        .weather-prompt p{ font-size:13px; color:#334155; }
        .btn.primary{ background:#0F766E; color:#fff; border:0; padding:8px 14px; border-radius:999px; font-weight:600; cursor:pointer; }
        .btn{ background:#fff; border:1px solid #E2E8E5; padding:6px 10px; border-radius:999px; font-size:12px; }
        .weather-loading,.weather-error{ margin-top:10px; font-size:13px; color:#64748B; }
        .loc{ font-size:13px; font-weight:600; margin-top:8px; }
        .temp{ font-size:32px; font-weight:800; margin-top:8px; } .desc{ font-size:14px; font-weight:500; color:#64748B; }
        .details{ display:flex; gap:12px; font-size:13px; margin-top:6px; flex-wrap:wrap; }
        .forecast{ margin-top:10px; font-size:12px; border-top:1px solid #E2E8E5; padding-top:8px; letter-spacing:1px; }
        .meta{ font-size:11px; color:#94A3B8; margin-top:6px; }
        .source-badge{ background:#F1F5F3; padding:2px 6px; border-radius:999px; }
        @media (max-width:640px){ .weather-card{ padding:12px; } }
      `}</style>
    </div>
  )
}
