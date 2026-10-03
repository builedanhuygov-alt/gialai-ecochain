import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Camera, MapPin, Navigation, Send } from 'lucide-react'
import { API_BASE, photoUrl } from '../services/api'
import { communityReportFeedMessage, submitCommunityFireReport } from '../services/communityReports'

type Report = {
  report_id: string
  location: { latitude: number; longitude: number }
  reported_at: string | null
  description: string
  photo: { available: boolean; url: string | null }
  photos?: { photo_id: string; url: string; gps: number[] | null; uploaded_at: string | null }[]
  source: string
  status: string
  linked_event_id: string | null
  match_distance_km: number | null
}

function ReportLocationPicker({
  latitude,
  longitude,
  onPick,
}: {
  latitude: number | null
  longitude: number | null
  onPick: (latitude: number, longitude: number) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const marker = useRef<maplibregl.Marker | null>(null)
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick

  useEffect(() => {
    if (!container.current) return
    const mapView = new maplibregl.Map({
      container: container.current,
      style: {
        version: 8,
        sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap' } },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
      center: [108.3, 13.9],
      zoom: 7,
      attributionControl: { compact: true },
    })
    map.current = mapView
    mapView.on('click', event => {
      const { lat, lng } = event.lngLat
      marker.current?.remove()
      marker.current = new maplibregl.Marker({ color: '#168257' }).setLngLat([lng, lat]).addTo(mapView)
      onPickRef.current(lat, lng)
    })
    return () => {
      marker.current?.remove()
      mapView.remove()
      map.current = null
    }
  }, [])

  useEffect(() => {
    const mapView = map.current
    if (!mapView || latitude == null || longitude == null) return
    marker.current?.remove()
    marker.current = new maplibregl.Marker({ color: '#168257' }).setLngLat([longitude, latitude]).addTo(mapView)
    mapView.easeTo({ center: [longitude, latitude], zoom: Math.max(mapView.getZoom(), 11), duration: 250 })
  }, [latitude, longitude])

  return <div className="cfr-map" ref={container} aria-label="Chọn tọa độ báo cáo trên bản đồ" />
}

function formatReportedAt(value: string | null): string {
  if (!value) return 'Chưa có thời gian'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Chưa có thời gian' : date.toLocaleString('vi-VN')
}

export default function CommunityFireReportForm() {
  const [latitudeText, setLatitudeText] = useState('')
  const [longitudeText, setLongitudeText] = useState('')
  const [description, setDescription] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [reports, setReports] = useState<Report[]>([])
  const photoInput = useRef<HTMLInputElement>(null)
  const [reportCount, setReportCount] = useState<number | null>(null)
  const [loadingReports, setLoadingReports] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [photoError, setPhotoError] = useState('')

  const latitude = latitudeText.trim() ? Number(latitudeText) : null
  const longitude = longitudeText.trim() ? Number(longitudeText) : null
  const setCoordinates = useCallback((lat: number, lon: number) => {
    setLatitudeText(String(lat))
    setLongitudeText(String(lon))
  }, [])

  const loadReports = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/citizen/fire-reports?limit=100`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const payload = await response.json()
      const rows = Array.isArray(payload?.reports) ? payload.reports : []
      setReports(rows)
      setReportCount(typeof payload?.count === 'number' ? payload.count : rows.length)
      setError('')
    } catch (cause) {
      setError(`Không tải được báo cáo đã lưu: ${String(cause)}`)
      setReports([])
      setReportCount(null)
    } finally {
      setLoadingReports(false)
    }
  }, [])

  useEffect(() => { void loadReports() }, [loadReports])

  const useDeviceLocation = () => {
    if (!navigator.geolocation) {
      setError('Trình duyệt không hỗ trợ lấy GPS.')
      return
    }
    setError('')
    navigator.geolocation.getCurrentPosition(
      position => setCoordinates(position.coords.latitude, position.coords.longitude),
      cause => setError(`Không lấy được GPS: ${cause.message}`),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    )
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setNotice('')
    setPhotoError('')
    if (latitude == null || longitude == null || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setError('Hãy lấy GPS hoặc chọn vị trí chính xác trên bản đồ trước khi gửi.')
      return
    }
    setLoading(true)
    try {
      const result = await submitCommunityFireReport({ description, latitude, longitude, photo })
      window.dispatchEvent(new Event('ecochain-community-report-created'))
      await loadReports()
      if (result.photoStatus === 'FAILED') {
        setPhotoError(result.photoError || 'Báo cáo đã lưu nhưng ảnh chưa tải lên.')
        setDescription('')
        setPhoto(null)
        if(photoInput.current) photoInput.current.value = ''
        return
      }
      const link = result.report.linked_event_id
      setNotice(link
        ? `Đã lưu báo cáo ${result.report.report_id}. Có phát hiện FIRMS gần đó (${result.report.match_distance_km} km); khoảng cách không xác nhận cùng đám cháy.`
        : `Đã lưu báo cáo độc lập ${result.report.report_id}; chưa có liên kết với phát hiện FIRMS.`)
      setDescription('')
      setPhoto(null)
      if(photoInput.current) photoInput.current.value = ''
    } catch (cause) {
      setError(String(cause))
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="cfr" aria-labelledby="cfr-title">
      <style>{`
        .cfr{background:#fff;border:1px solid #dce6e1;border-radius:8px;padding:16px;color:#17251f}
        .cfr h2{font-size:15px;margin:0;font-weight:800}
        .cfr-head{display:flex;align-items:center;gap:9px;color:#176b52}
        .cfr-copy{color:#62726b;font-size:12px;line-height:1.5;margin:7px 0 14px}
        .cfr-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(260px,.9fr);gap:12px}
        .cfr-fields{display:grid;gap:10px;align-content:start}
        .cfr-field{display:grid;gap:5px;font-size:11px;font-weight:800;color:#60716a}
        .cfr-field input,.cfr-field textarea{box-sizing:border-box;width:100%;border:1px solid #dce6e1;border-radius:6px;padding:9px 10px;color:#17251f;background:#fff;font:inherit;font-weight:400}
        .cfr-field textarea{min-height:84px;resize:vertical}
        .cfr-coords{display:grid;grid-template-columns:1fr 1fr;gap:8px}
        .cfr-map{height:250px;border:1px solid #dce6e1;border-radius:6px;overflow:hidden;background:#edf2ef}
        .cfr-map-help{font-size:10px;color:#62726b;margin-top:5px}
        .cfr-actions{display:flex;gap:8px;flex-wrap:wrap}
        .cfr-button{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid #176b52;border-radius:6px;padding:8px 10px;background:#176b52;color:#fff;font-size:11px;font-weight:800;cursor:pointer}
        .cfr-button.secondary{background:#fff;color:#176b52}
        .cfr-button:disabled{opacity:.55;cursor:wait}
        .cfr-file{font-size:11px;font-weight:400;color:#485a52}
        .cfr-message{font-size:11px;line-height:1.45;padding:8px 10px;border-radius:5px;background:#edf7f1;color:#176b52}
        .cfr-message.warn{background:#fff6e6;color:#805d14}
        .cfr-message.error{background:#fff0ee;color:#9e3329}
        .cfr-feed{margin-top:16px;border-top:1px solid #e8eeeb;padding-top:12px}
        .cfr-feed-head{display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:800}
        .cfr-report{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;padding:10px 0;border-top:1px solid #edf1ef;font-size:11px}
        .cfr-report p{grid-column:1/-1;margin:2px 0;color:#485a52;white-space:pre-wrap;overflow-wrap:anywhere}
        .cfr-report-meta{color:#66766f}
        .cfr-report a{color:#176b52;font-weight:700;text-decoration:none}
        .cfr-thumb{width:68px;height:54px;object-fit:cover;border-radius:4px;border:1px solid #dce6e1}
        @media(max-width:720px){.cfr-grid{grid-template-columns:1fr}.cfr-map{height:220px}}
      `}</style>
      <div className="cfr-head"><MapPin size={17} /><h2 id="cfr-title">Báo cáo điểm nghi ngờ</h2></div>
      <p className="cfr-copy">Báo cáo do người dùng gửi, không tự xác nhận đám cháy. Không cần đăng nhập; báo cáo được lưu ẩn danh.</p>
      <form onSubmit={submit}>
        <div className="cfr-grid">
          <div className="cfr-fields">
            <label className="cfr-field">MÔ TẢ BẮT BUỘC
              <textarea required value={description} onChange={event => setDescription(event.target.value)} placeholder="Nhập điều bạn trực tiếp quan sát được." />
            </label>
            <div className="cfr-actions">
              <button className="cfr-button secondary" type="button" onClick={useDeviceLocation}><Navigation size={14} /> Lấy GPS</button>
            </div>
            <div className="cfr-coords">
              <label className="cfr-field">VĨ ĐỘ
                <input inputMode="decimal" value={latitudeText} onChange={event => setLatitudeText(event.target.value)} placeholder="Chọn GPS hoặc bản đồ" />
              </label>
              <label className="cfr-field">KINH ĐỘ
                <input inputMode="decimal" value={longitudeText} onChange={event => setLongitudeText(event.target.value)} placeholder="Chọn GPS hoặc bản đồ" />
              </label>
            </div>
            <label className="cfr-field">ẢNH THỰC TẾ (KHÔNG BẮT BUỘC)
              <input ref={photoInput} className="cfr-file" type="file" accept="image/*" capture="environment" onChange={event => setPhoto(event.target.files?.[0] || null)} />
            </label>
            {photo && <span className="cfr-file"><Camera size={13} /> {photo.name}</span>}
            <div className="cfr-actions">
              <button className="cfr-button" type="submit" disabled={loading}><Send size={14} />{loading ? 'Đang gửi…' : 'Gửi báo cáo'}</button>
            </div>
          </div>
          <div>
            <ReportLocationPicker latitude={latitude} longitude={longitude} onPick={setCoordinates} />
            <div className="cfr-map-help">Chạm hoặc nhấp bản đồ để chọn tọa độ báo cáo. Marker chỉ xuất hiện sau khi có GPS hoặc bạn chọn điểm.</div>
          </div>
        </div>
      </form>
      {error && <p className="cfr-message error" role="alert">{error}</p>}
      {photoError && <p className="cfr-message warn" role="status">{photoError}</p>}
      {notice && <p className="cfr-message" role="status">{notice}</p>}
      <div className="cfr-feed">
        <div className="cfr-feed-head"><span>BÁO CÁO ĐÃ LƯU</span><span>{reportCount == null ? 'Chưa tải được' : reportCount}</span></div>
        {communityReportFeedMessage(reportCount, loadingReports) && <p className="cfr-copy">{communityReportFeedMessage(reportCount, loadingReports)}</p>}
        {reports.map(report => (
          <article className="cfr-report" key={report.report_id}>
            <Link to={`/community/reports/${encodeURIComponent(report.report_id)}`}>Báo cáo {report.report_id}</Link>
            <span className="cfr-report-meta">{formatReportedAt(report.reported_at)}</span>
            <p>{report.description}</p>
            <span className="cfr-report-meta">{report.location?.latitude}, {report.location?.longitude} · {report.status}</span>
            {report.linked_event_id && <Link to={`/events/${encodeURIComponent(report.linked_event_id)}`}>Liên kết gần với phát hiện FIRMS {report.linked_event_id} · {report.match_distance_km} km</Link>}
            {report.photo?.available && report.photo.url && <img className="cfr-thumb" src={photoUrl(report.photo.url)} alt={`Ảnh thực địa của báo cáo ${report.report_id}`} />}
          </article>
        ))}
      </div>
    </section>
  )
}
