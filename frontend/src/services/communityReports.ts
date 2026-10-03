import { API_BASE } from './api'

export type CommunityFireReportInput = {
  description: string
  latitude: number
  longitude: number
  reporter?: string
  photo?: File | null
}

export type CommunityFireReportSubmission = {
  report: Record<string, any>
  photoStatus: 'NOT_REQUESTED' | 'SAVED' | 'FAILED'
  complete: boolean
  photoError?: string
}

export function validateCommunityFireReport(input: CommunityFireReportInput): string | null {
  if (!input.description.trim()) return 'Mô tả là bắt buộc.'
  if (!Number.isFinite(input.latitude) || Math.abs(input.latitude) > 90) return 'Vĩ độ không hợp lệ.'
  if (!Number.isFinite(input.longitude) || Math.abs(input.longitude) > 180) return 'Kinh độ không hợp lệ.'
  if (input.photo && !input.photo.type.startsWith('image/')) return 'Tệp tải lên phải là ảnh.'
  return null
}

export function communityReportFeedMessage(count: number | null, loading: boolean): string | null {
  if (loading) return 'Đang tải báo cáo đã lưu…'
  if (count === null) return 'Chưa thể đọc danh sách báo cáo từ máy chủ.'
  if (count === 0) return 'Chưa có báo cáo cộng đồng.'
  return null
}

export async function submitCommunityFireReport(input: CommunityFireReportInput): Promise<CommunityFireReportSubmission> {
  const invalid = validateCommunityFireReport(input)
  if (invalid) throw new Error(invalid)

  const response = await fetch(`${API_BASE}/api/citizen/fire-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: input.description.trim(),
      latitude: input.latitude,
      longitude: input.longitude,
      reporter: input.reporter?.trim() || undefined,
    }),
  })
  if (!response.ok) throw new Error(`Không lưu được báo cáo (${response.status}).`)
  const report = await response.json()
  if (typeof report?.report_id !== 'string' || !report.report_id) {
    throw new Error('Máy chủ không trả mã báo cáo; không thể xác nhận đã lưu.')
  }
  if (!input.photo) return { report, photoStatus: 'NOT_REQUESTED', complete: true }

  const data = new FormData()
  data.append('file', input.photo)
  data.append('source', 'citizen')
  data.append('source_id', report.report_id)
  data.append('uploader_id', input.reporter?.trim() || 'anonymous')
  data.append('lat', String(input.latitude))
  data.append('lng', String(input.longitude))

  try {
    const photoResponse = await fetch(`${API_BASE}/api/evidence`, { method: 'POST', body: data })
    if (!photoResponse.ok) {
      const detail = await photoResponse.text()
      return {
        report,
        photoStatus: 'FAILED',
        complete: false,
        photoError: `Báo cáo đã lưu; ảnh chưa tải lên (${photoResponse.status})${detail ? `: ${detail.slice(0, 160)}` : '.'}`,
      }
    }
    return { report, photoStatus: 'SAVED', complete: true }
  } catch (error) {
    return {
      report,
      photoStatus: 'FAILED',
      complete: false,
      photoError: `Báo cáo đã lưu; ảnh chưa tải lên: ${String(error).slice(0, 160)}`,
    }
  }
}
