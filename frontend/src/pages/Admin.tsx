export default function Admin(){
  const saveGEE = ()=>{
    const pid=(document.getElementById('gee_pid') as HTMLInputElement)?.value
    const svc=(document.getElementById('gee_svc') as HTMLInputElement)?.value
    const key=(document.getElementById('gee_key') as HTMLTextAreaElement)?.value
    if(pid) localStorage.setItem('ecogl_gee_project', pid)
    if(svc) localStorage.setItem('ecogl_gee_svc', svc)
    if(key) localStorage.setItem('ecogl_gee_key', key)
    alert('Đã lưu tạm vào trình duyệt. Để backend dùng thực, dán vào file backend/.env rồi restart uvicorn.')
  }
  const saveMap = ()=>{
    const v=(document.getElementById('map_key2') as HTMLInputElement)?.value || ''
    localStorage.setItem('ecogl_map_key', v); localStorage.setItem('ecogl_map_style', v); location.reload()
  }
  return (
    <div className="page">
      <h1>Quản trị — Người dùng · Vai trò · Nguồn dữ liệu · Agent · Sức khỏe hệ thống</h1>
      <div className="health"><div>Cơ sở dữ liệu ● Trực tuyến</div><div>API ● Trực tuyến</div><div>GEE ● Chưa cấu hình (cần key)</div><div>AI Services ● Trực tuyến</div></div>
      <div className="agents"><div>AGENT RỪNG ● TRỰC TUYẾN 99.1%</div><div>AGENT THIÊN TAI ● TRỰC TUYẾN</div><div>AGENT LOGISTICS ● TRỰC TUYẾN</div></div>

      <div className="card" style={{background:'#fff', border:'1px solid #E2E8E5', borderRadius:12, padding:16, marginTop:12}}>
        <h3>1. Nhập API Bản đồ hiển thị (Map Tiles — cho Bản đồ trực tiếp)</h3>
        <p style={{fontSize:12, color:'#64748B'}}>Dùng cho nền bản đồ, không phải dữ liệu vệ tinh phân tích. Để trống = OSM miễn phí. Có key thì dán vào đây hoặc ngay trên Bản đồ.</p>
        <input id="map_key2" placeholder="MapTiler key hoặc URL style JSON (https://api.maptiler.com/...)" style={{width:'100%', padding:'8px', border:'1px solid #E2E8E5', borderRadius:8, marginTop:8}} />
        <button onClick={saveMap} style={{marginTop:8, background:'#0F766E', color:'#fff', border:0, padding:'8px 12px', borderRadius:999}}>Lưu & Tải lại bản đồ</button>
        <div style={{fontSize:11, color:'#64748B', marginTop:6}}>Vị trí file: trình duyệt localStorage <code>ecogl_map_key</code> · Hoặc set <code>VITE_MAP_STYLE</code> trong <code>frontend/.env</code></div>
      </div>

      <div className="card" style={{background:'#FFF7ED', border:'1px solid #FDBA74', borderRadius:12, padding:16, marginTop:12}}>
        <h3>2. Nhập API Vệ tinh EE Sentinel (Google Earth Engine — cho phân tích NDVI/Rừng)</h3>
        <p style={{fontSize:12, color:'#7C2D12'}}>Đây là <b>backend</b>, không phải bản đồ nền. Cần Service Account của Google Cloud. <a href="https://code.earthengine.google.com" target="_blank">Lấy tại code.earthengine.google.com</a></p>
        <div style={{display:'grid', gap:8, marginTop:8}}>
          <input id="gee_pid" placeholder="GEE_PROJECT_ID (ví dụ: ecogl-gialai)" style={{padding:'8px', border:'1px solid #E2E8E5', borderRadius:8}} />
          <input id="gee_svc" placeholder="GEE_SERVICE_ACCOUNT (xxx@xxx.iam.gserviceaccount.com)" style={{padding:'8px', border:'1px solid #E2E8E5', borderRadius:8}} />
          <textarea id="gee_key" placeholder="GEE_PRIVATE_KEY (-----BEGIN PRIVATE KEY----- ...)" rows={3} style={{padding:'8px', border:'1px solid #E2E8E5', borderRadius:8}} />
        </div>
        <button onClick={saveGEE} style={{marginTop:8, background:'#0B1412', color:'#fff', border:0, padding:'8px 12px', borderRadius:999}}>Lưu tạm (trình duyệt)</button>
        <div style={{fontSize:12, marginTop:10, background:'#fff', border:'1px solid #E2E8E5', borderRadius:8, padding:10}}>
          <b>Để bật vệ tinh thực (khuyến nghị):</b><br/>
          1. Mở file <code>C:\Users\danhu\Documents\Default Project\backend\.env</code> (tạo từ <code>.env.example</code>)<br/>
          2. Dán 3 dòng:<br/>
          <code>GEE_PROJECT_ID=ecogl-gialai</code><br/>
          <code>GEE_SERVICE_ACCOUNT=xxx@xxx.iam.gserviceaccount.com</code><br/>
          <code>GEE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."</code><br/>
          3. Restart backend: tắt uvicorn (PID 14188) → <code>uvicorn app.main:app --reload --port 8000</code><br/>
          4. Kiểm tra: <code>http://127.0.0.1:8000/api/earth-engine/status</code> phải trả <code>{`{"connected":true}`}</code> thay vì <code>NOT_CONFIGURED</code><br/>
          <span style={{color:'#DC2626'}}>Không commit file .env lên Git!</span>
        </div>
      </div>

      <div className="audit">Nhật ký: 14:32 Quản trị Tỉnh đã xác minh sự cố Thôn A — THÀNH CÔNG</div>
      <style>{`.health,.agents{display:grid; grid-template-columns:repeat(2,1fr); gap:12px; margin-top:12px} .health div,.agents div{background:#fff; border:1px solid #E2E8E5; border-radius:12px; padding:12px; font-size:13px} .audit{background:#fff; border:1px solid #E2E8E5; border-radius:12px; padding:12px; margin-top:12px; font-size:13px; font-family:monospace}`}</style>
    </div>
  )
}
