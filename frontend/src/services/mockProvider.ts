export const mockKPIs = [
  { label:'Điểm EcoGL tổng', value:'88.4', unit:'/100', trend:'+2.1%', dir:'up', status:'good' },
  { label:'Vùng rủi ro cao', value:'27', unit:'vùng', trend:'+4', dir:'up', status:'warn' },
  { label:'Sự cố đang hoạt động', value:'11', unit:'', trend:'ổn định', dir:'flat', status:'danger' },
  { label:'Sức khỏe rừng', value:'78.4', unit:'chỉ số', trend:'+2.8%', dir:'up', status:'good' },
  { label:'Carbon ước tính', value:'1.2M', unit:'tCO₂e', trend:'+3.1%', dir:'up', status:'neutral' },
  { label:'Báo cáo đã xác minh', value:'342', unit:'', trend:'+18', dir:'up', status:'good' },
  { label:'Thời gian phản hồi', value:'18p', unit:'', trend:'-4p', dir:'down', status:'good' },
  { label:'Giảm CO₂', value:'14%', unit:'', trend:'+2%', dir:'up', status:'good' },
]
export const mockAlerts = [
  { id:'1', severity:'HIGH', icon:'🔥', title:'Nguy cơ cháy cao', loc:'Thôn 1 · Xã A', time:'8 phút trước', status:'Cộng đồng đã xác minh', source:'Sentinel-2 + Cộng đồng' },
  { id:'2', severity:'WARN', icon:'⚠', title:'Khả năng ngập tăng', loc:'Xã Ia Grai', time:'21 phút trước', status:'Chờ xử lý', source:'Thời tiết' },
  { id:'3', severity:'INFO', icon:'🌳', title:'Phát hiện bất thường rừng', loc:'Khoảnh 4', time:'42 phút trước', status:'AI phát hiện', source:'GEE' },
]
export const mockInsight = {
  title:'Nguy cơ cháy rừng tăng trong khu vực đã chọn.',
  confidence: 89,
  why: ['khô hạn thực bì','xu hướng nhiệt độ gần đây','bất thường vệ tinh','tiền sử sự cố'],
  sources:['Sentinel-2','Thời tiết','Báo cáo đã xác minh'], ts: '2 giờ trước'
}
