/** Hiển thị thiếu dữ liệu bằng tiếng Việt.
 * Backend/API dùng mã 'MISSING' (giữ nguyên trong logic so sánh) —
 * chỉ doi sang 'thiếu' ở đúng chỗ render cho người dùng. */
export function hienThi(v: unknown): string {
  if (v === null || v === undefined || v === '') return 'thiếu'
  if (typeof v === 'string' && v.trim().toUpperCase() === 'MISSING') return 'thiếu'
  return String(v)
}
