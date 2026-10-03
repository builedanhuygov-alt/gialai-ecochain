import { afterEach, describe, expect, it, vi } from 'vitest'
import { communityReportFeedMessage, submitCommunityFireReport, validateCommunityFireReport } from './communityReports'

const reportInput = {
  description: 'Quan sát thấy khói ở sườn đồi phía đông.',
  latitude: 14.11535,
  longitude: 108.56094,
}

const savedReport = {
  report_id: 'report-real-id',
  location: { latitude: reportInput.latitude, longitude: reportInput.longitude },
  reported_at: '2026-10-02T09:30:00',
  linked_event_id: null,
}

afterEach(() => vi.unstubAllGlobals())

describe('community fire report submission', () => {
  it('shows an honest empty-state count from the server result', () => {
    expect(communityReportFeedMessage(0, false)).toBe('Chưa có báo cáo cộng đồng.')
    expect(communityReportFeedMessage(1, false)).toBeNull()
    expect(communityReportFeedMessage(2, false)).toBeNull()
    expect(communityReportFeedMessage(null, false)).toContain('máy chủ')
  })

  it('requires a description and valid coordinates', () => {
    expect(validateCommunityFireReport({ ...reportInput, description: '  ' })).toContain('Mô tả')
    expect(validateCommunityFireReport({ ...reportInput, latitude: 91 })).toContain('Vĩ độ')
    expect(validateCommunityFireReport({ ...reportInput, longitude: 181 })).toContain('Kinh độ')
  })

  it('preserves the report GPS and only succeeds after a persisted report response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => savedReport,
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await submitCommunityFireReport(reportInput)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.latitude).toBe(reportInput.latitude)
    expect(body.longitude).toBe(reportInput.longitude)
    expect(result.report.report_id).toBe('report-real-id')
    expect(result.complete).toBe(true)
    expect(result.photoStatus).toBe('NOT_REQUESTED')
  })

  it('does not report a complete photo submission when upload fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => savedReport })
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'storage unavailable' })
    vi.stubGlobal('fetch', fetchMock)
    const photo = new File(['real test bytes'], 'field.jpg', { type: 'image/jpeg' })

    const result = await submitCommunityFireReport({ ...reportInput, photo })
    expect(result.report.report_id).toBe('report-real-id')
    expect(result.photoStatus).toBe('FAILED')
    expect(result.complete).toBe(false)
    expect(result.photoError).toContain('ảnh chưa tải lên')
  })
})
