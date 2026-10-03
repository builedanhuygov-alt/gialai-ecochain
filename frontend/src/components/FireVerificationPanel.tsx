import { useEffect, useMemo, useState } from 'react'
import { API_BASE } from '../services/api'
import { haversineKm } from './AssetDrawer'

export type FireVerification = {
  id: string
  verdict: 'YES' | 'NO' | 'UNSURE'
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  description: string
  createdAt: string
  photoName?: string
}

const STORE_KEY = 'ecochain-fire-verifications-v1'
const verdictLabel: Record<FireVerification['verdict'], string> = { YES: 'Có cháy', UNSURE: 'Chưa chắc', NO: 'Không thấy cháy' }
const severityLabel: Record<FireVerification['severity'], string> = { LOW: 'Nhẹ', MEDIUM: 'Vừa', HIGH: 'Nặng', CRITICAL: 'Rất nặng' }

export function readFireVerifications(): Record<string, FireVerification[]> {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') } catch { return {} }
}

function satelliteUrl(lat: number, lon: number) {
  const d = 0.035
  const bbox = `${lon - d},${lat - d},${lon + d},${lat + d}`
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${bbox}&bboxSR=4326&imageSR=4326&size=900,560&format=jpg&f=image`
}

export default function FireVerificationPanel({ eventId, lat, lon }: { eventId: string; lat: number; lon: number }) {
  const [all, setAll] = useState<Record<string, FireVerification[]>>(() => readFireVerifications())
  const [position, setPosition] = useState<{ lat: number; lon: number } | null>(null)
  const [locationState, setLocationState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [description, setDescription] = useState('')
  const [verdict, setVerdict] = useState<FireVerification['verdict']>('YES')
  const [severity, setSeverity] = useState<FireVerification['severity']>('HIGH')
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const ratings = all[eventId] || []
  const distance = position ? haversineKm(lon, lat, position.lon, position.lat) : null
  const satellite = useMemo(() => satelliteUrl(lat, lon), [lat, lon])
  const stats = useMemo(() => {
    const count = ratings.length || 1
    return {
      total: ratings.length,
      yes: ratings.filter(r => r.verdict === 'YES').length,
      no: ratings.filter(r => r.verdict === 'NO').length,
      unsure: ratings.filter(r => r.verdict === 'UNSURE').length,
      avgSeverity: ratings.length ? Math.round(ratings.reduce((sum, r) => sum + ({ LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }[r.severity]), 0) / count * 10) / 10 : 0,
    }
  }, [ratings])

  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview) }, [photoPreview])

  const requestLocation = () => {
    if (!navigator.geolocation) { setLocationState('error'); return }
    setLocationState('loading')
    navigator.geolocation.getCurrentPosition(
      p => { setPosition({ lat: p.coords.latitude, lon: p.coords.longitude }); setLocationState('ready') },
      () => setLocationState('error'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }

  const choosePhoto = (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { setMessage('Vui lòng chọn tệp ảnh.'); return }
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhoto(file)
    setPhotoPreview(URL.createObjectURL(file))
    setMessage('')
  }

  const submit = async () => {
    if (!description.trim() && !photo) { setMessage('Hãy thêm mô tả hoặc ảnh hiện trường.'); return }
    setSaving(true); setMessage('')
    const item: FireVerification = { id: eventId, verdict, severity, description: description.trim(), createdAt: new Date().toISOString(), photoName: photo?.name }
    const next = { ...all, [eventId]: [...(all[eventId] || []), item] }
    localStorage.setItem(STORE_KEY, JSON.stringify(next)); setAll(next)
    window.dispatchEvent(new CustomEvent('ecochain-fire-verification'))
    if (photo) {
      try {
        const fd = new FormData()
        fd.append('file', photo)
        fd.append('source', 'incident')
        fd.append('source_id', eventId)
        fd.append('uploader_id', 'community-web')
        fd.append('lat', String(position?.lat ?? lat))
        fd.append('lng', String(position?.lon ?? lon))
        fd.append('capture_time', item.createdAt)
        await fetch(`${API_BASE}/api/evidence`, { method: 'POST', body: fd })
      } catch { /* Local copy remains available when evidence API is unavailable. */ }
    }
    setDescription(''); setPhoto(null); setPhotoPreview(''); setSaving(false); setMessage('Đã ghi nhận đánh giá cộng đồng, đang chờ xác minh.')
  }

  return (
    <section className="ei-panel fire-verify" aria-label="Xác minh điểm cháy">
      <div className="ei-kicker">XÁC MINH TẠI ĐIỂM CHÁY</div>
      <p className="ei-meta" style={{ marginTop: 6 }}>Tín hiệu cộng đồng không thay thế xác nhận của Kiểm lâm. Cho phép vị trí để đo khoảng cách từ bạn đến điểm này.</p>
      <div className="fire-verify-grid">
        <div>
          <img src={satellite} alt="Ảnh vệ tinh khu vực điểm cháy" className="fire-satellite" />
          <a className="ei-meta" href={satellite} target="_blank" rel="noreferrer">Mở ảnh vệ tinh kích thước lớn</a>
        </div>
        <div className="fire-verify-location">
          <button className="ei-btn blue" type="button" onClick={requestLocation} disabled={locationState === 'loading'}>
            {locationState === 'loading' ? 'Đang xin quyền vị trí...' : 'Định vị tôi'}
          </button>
          {locationState === 'ready' && <b>Khoảng cách: {distance != null ? `${distance.toFixed(2)} km` : 'Không tính được'}</b>}
          {locationState === 'error' && <span className="ei-meta">Không lấy được vị trí. Bạn có thể vẫn gửi đánh giá.</span>}
        </div>
      </div>
      <div className="fire-verify-stats" aria-label="Thống kê đánh giá cháy">
        <b>{stats.total} đánh giá</b><span>Có cháy: {stats.yes}</span><span>Chưa chắc: {stats.unsure}</span><span>Không: {stats.no}</span><span>Mức TB: {stats.avgSeverity || '—'}/4</span>
      </div>
      <div className="fire-verify-form">
        <label>Đánh giá xác thực
          <select value={verdict} onChange={e => setVerdict(e.target.value as FireVerification['verdict'])}>{Object.entries(verdictLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
        <label>Mức độ cháy
          <select value={severity} onChange={e => setSeverity(e.target.value as FireVerification['severity'])}>{Object.entries(severityLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
        <label className="fire-verify-wide">Mô tả hiện trường
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Bạn thấy gì? Khói, lửa, hướng lan, thời điểm..." rows={3} />
        </label>
        <label className="fire-upload fire-verify-wide">Ảnh hiện trường
          <input type="file" accept="image/*" capture="environment" onChange={e => choosePhoto(e.target.files?.[0])} />
        </label>
        {photoPreview && <img src={photoPreview} alt="Ảnh hiện trường đã chọn" className="fire-upload-preview fire-verify-wide" />}
        <button className="ei-btn primary fire-verify-wide" type="button" onClick={submit} disabled={saving}>{saving ? 'Đang gửi...' : 'Gửi đánh giá và ảnh'}</button>
      </div>
      {message && <div className="ei-meta" role="status" style={{ marginTop: 8 }}>{message}</div>}
    </section>
  )
}
