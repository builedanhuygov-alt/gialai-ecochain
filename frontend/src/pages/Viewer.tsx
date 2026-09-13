import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../services/api'

// M3 — /viewer/:assetId: Panoee iframe embed, fullscreen, responsive,
// mobile friendly. Only real stored media is ever shown (no generated URLs).
export default function Viewer(){
  const { assetId } = useParams()
  const [a, setA] = useState<any>(null)
  const [err, setErr] = useState('')
  useEffect(()=>{
    if(!assetId) return
    api.assetDetail(assetId).then(setA).catch((e:any)=> setErr(String(e.message || e).slice(0, 200)))
  },[assetId])
  const v = a?.viewer
  return (
    <div style={{maxWidth:960, margin:'0 auto', padding:12}}>
      <Link to="/" style={{fontSize:12, color:'#0F766E', fontWeight:700}}>← Bản đồ</Link>
      {err && <div style={{marginTop:8, fontSize:13, color:'#B91C1C'}}>⚠ {err}</div>}
      {a && !err && (
        <>
          <h1 style={{margin:'8px 0 2px', fontSize:18}}>🌐 {a.name}</h1>
          <div style={{fontSize:12, color:'#64748B'}}>
            {a.asset_type} · Cập nhật: {a.updated_at || a.created_at || '?'} ·
            {' '}xác minh: <b>{v?.verification_status || '?'}</b>
            {a.capture_source && <> · nguồn: {a.capture_source}{a.capture_date ? ` (${a.capture_date})` : ''}</>}
          </div>
          {v?.viewer_type === 'panoee' && v?.viewer_url && (
            <div style={{marginTop:12}}>
              <iframe src={v.viewer_url} title={`360 ${a.name}`} allowFullScreen
                allow="fullscreen; accelerometer; gyroscope"
                style={{width:'100%', height:'min(70vh, 560px)', border:0, borderRadius:12, background:'#0B1412'}} />
              <div style={{fontSize:11, color:'#64748B', marginTop:4}}>Tour 360° Panoee — xoay/phóng bằng tay, nút fullscreen trong khung.</div>
            </div>
          )}
          {v?.viewer_type === 'streetview' && v?.viewer_url && (
            <div style={{marginTop:12}}>
              <a href={v.viewer_url} target="_blank" rel="noreferrer"
                style={{display:'inline-block', background:'#0F766E', color:'#fff', borderRadius:999, padding:'10px 22px', fontSize:14, fontWeight:700, textDecoration:'none'}}>🌐 Mở Street View (URL đã xác minh)</a>
            </div>
          )}
          {v?.viewer_type === 'streetview' && !v?.viewer_url && (
            <div style={{marginTop:12, fontSize:13}}>🌐 Street View đã xác minh tồn tại — chưa lưu URL. Bổ sung URL trong trang Quản trị để mở.</div>
          )}
          {v?.viewer_type === 'photos' && (
            <div style={{marginTop:12, fontSize:13}}>📷 {v.detail} Mở bản đồ để xem ảnh quanh điểm này.</div>
          )}
          {v?.viewer_type === 'satellite' && (
            <div style={{marginTop:12, fontSize:13}}>🛰️ Chưa có ảnh 360°/thực địa — xem nền ảnh vệ tinh trên bản đồ. <Link to="/">Mở bản đồ</Link></div>
          )}
          {(!v || v.viewer_type === 'none') && (
            <div style={{marginTop:12, fontSize:13, color:'#B91C1C'}}>Chưa có dữ liệu hình ảnh.</div>
          )}
          {a.preview_image_url && (
            <div style={{marginTop:12}}><img src={a.preview_image_url} alt={`Xem trước ${a.name}`} style={{maxWidth:'100%', borderRadius:12}} /></div>
          )}
        </>
      )}
      <style>{`@media (max-width:640px){ iframe{ height:60vh !important; } }`}</style>
    </div>
  )
}
