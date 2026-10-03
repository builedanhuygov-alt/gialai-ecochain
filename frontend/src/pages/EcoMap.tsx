import { useState } from 'react'
import MapView from '../components/MapView'
import WhatIfPanel from '../components/WhatIfPanel'

export default function EcoMap(){
  const [showWhatIf, setShowWhatIf] = useState(false)
  return (
    <div style={{margin:-24, height:'calc(100vh - 64px)', position:'relative'}}>
      <MapView />
      <button onClick={()=> setShowWhatIf(v=> !v)} aria-expanded={showWhatIf}
        title="Thử điều kiện khô/nóng hơn (THỬ NGHIỆM)"
        style={{position:'absolute', top:12, right:12, zIndex:20, background:'#0B1412', color:'#fff',
          border:0, borderRadius:999, padding:'8px 14px', fontSize:12, fontWeight:700, cursor:'pointer'}}>
        Điều gì nếu… {showWhatIf ? '▴' : '▾'}
      </button>
      {showWhatIf && (
        <div style={{position:'absolute', top:52, right:12, zIndex:20, width:'min(340px, calc(100vw - 24px))',
          maxHeight:'calc(100% - 64px)', overflow:'auto'}}>
          <WhatIfPanel />
        </div>
      )}
    </div>
  )
}
