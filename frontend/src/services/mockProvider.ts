export const mockKPIs = [
  { label:'Overall EcoGL Score', value:'88.4', unit:'/100', trend:'+2.1%', dir:'up', status:'good' },
  { label:'High Risk Areas', value:'27', unit:'zones', trend:'+4', dir:'up', status:'warn' },
  { label:'Active Incidents', value:'11', unit:'', trend:'stable', dir:'flat', status:'danger' },
  { label:'Forest Health', value:'78.4', unit:'index', trend:'+2.8%', dir:'up', status:'good' },
  { label:'Estimated Carbon', value:'1.2M', unit:'tCO₂e', trend:'+3.1%', dir:'up', status:'neutral' },
  { label:'Verified Reports', value:'342', unit:'', trend:'+18', dir:'up', status:'good' },
  { label:'Avg Response', value:'18m', unit:'', trend:'-4m', dir:'down', status:'good' },
  { label:'CO₂ Reduction', value:'14%', unit:'', trend:'+2%', dir:'up', status:'good' },
]
export const mockAlerts = [
  { id:'1', severity:'HIGH', icon:'🔥', title:'High fire risk', loc:'Thôn 1 · Xã A', time:'8 min ago', status:'Community Verified', source:'Sentinel-2 + Community' },
  { id:'2', severity:'WARN', icon:'⚠', title:'Flood probability increased', loc:'Xã Ia Grai', time:'21 min ago', status:'Pending', source:'Weather' },
  { id:'3', severity:'INFO', icon:'🌳', title:'Forest anomaly detected', loc:'Khoảnh 4', time:'42 min ago', status:'AI Detected', source:'GEE' },
]
export const mockInsight = {
  title:'Forest fire risk increased in the selected area.',
  confidence: 89,
  why: ['vegetation dryness','recent temperature trend','satellite anomaly','historical incidents'],
  sources:['Sentinel-2','Weather','Verified reports'], ts: '2 hours ago'
}
