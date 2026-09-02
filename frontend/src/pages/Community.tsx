export default function Community(){
  return (
    <div className="page">
      <h1>Community — Citizen Intelligence</h1>
      <div className="feed">
        <div className="post"><img src="https://picsum.photos/600/300?random=1" alt=""/><div className="meta">Fire report · Thôn 1 · 12 min ago · <span className="badge">COMMUNITY VERIFIED</span> · 2 confirmations · AI 87% <button>Review</button></div></div>
        <div className="upload"><button>📷 Upload Photo</button><button>🎥 Video</button><button>📍 Location</button></div>
        <div className="flow">REPORT → COMMUNITY CONFIRMATION → ADMIN REVIEW → CONFIRMED</div>
      </div>
      <style>{`.post{background:#fff; border:1px solid #E2E8E5; border-radius:16px; overflow:hidden} .post img{width:100%} .meta{padding:12px; font-size:13px} .badge{background:#DBEAFE; color:#1E40AF; padding:4px 8px; border-radius:999px; font-size:11px} .upload{display:flex; gap:8px; margin-top:12px} .upload button{background:#fff; border:1px solid #E2E8E5; border-radius:999px; padding:8px 12px} .flow{background:#fff; border:1px solid #E2E8E5; border-radius:12px; padding:12px; margin-top:12px; text-align:center; font-size:13px; letter-spacing:0.4px}`}</style>
    </div>
  )
}
