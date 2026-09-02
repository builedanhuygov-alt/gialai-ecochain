import { useState, useCallback } from 'react'

type State = { status:'idle'|'prompt'|'locating'|'granted'|'denied'|'unsupported'|'error', lat?:number, lon?:number, error?:string }

export function useLocation(){
  const [state, setState] = useState<State>({ status:'idle' })

  const request = useCallback(()=>{
    if(!('geolocation' in navigator)){
      setState({ status:'unsupported', error:'Location is not supported on this device/browser.' })
      return
    }
    setState({ status:'locating' })
    navigator.geolocation.getCurrentPosition(
      pos=> {
        const { latitude: lat, longitude: lon } = pos.coords
        setState({ status:'granted', lat: Math.round(lat*10000)/10000, lon: Math.round(lon*10000)/10000 })
      },
      err=>{
        if(err.code===1) setState({ status:'denied', error:'Location permission was denied. You can enable it in browser settings.' })
        else if(err.code===3) setState({ status:'error', error:'Position unavailable or timeout.' })
        else setState({ status:'error', error: err.message })
      },
      { enableHighAccuracy:false, timeout:8000, maximumAge:60000 }
    )
  },[])

  return { state, request }
}
