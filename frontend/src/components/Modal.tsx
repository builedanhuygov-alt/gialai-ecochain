import { motion, AnimatePresence } from 'framer-motion'
import type { ReactNode } from 'react'

export function Modal({ open, onClose, children, title }: { open:boolean; onClose:()=>void; children:ReactNode; title?:string }){
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="backdrop" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.2}} onClick={onClose} style={{position:'fixed', inset:0, background:'rgba(15,30,26,0.4)', backdropFilter:'blur(2px)', zIndex:50}} />
          <motion.div initial={{opacity:0, scale:0.98, y:8}} animate={{opacity:1, scale:1, y:0}} exit={{opacity:0, scale:0.98, y:4}} transition={{ duration:0.32, ease:[0.16,1,0.3,1] as any }} style={{position:'fixed', inset:0, display:'grid', placeItems:'center', zIndex:51, pointerEvents:'none'}}>
            <div style={{background:'#fff', borderRadius:16, padding:20, maxWidth:560, width:'90%', pointerEvents:'auto', boxShadow:'0 8px 24px rgba(15,30,26,0.12)'}}>
              {title && <div style={{fontWeight:700, marginBottom:12}}>{title}</div>}
              {children}
              <button onClick={onClose} style={{marginTop:16, padding:'8px 12px', borderRadius:999, border:'1px solid #E2E8E5', background:'#fff'}}>Đóng</button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export function Drawer({ open, onClose, children, title }: { open:boolean; onClose:()=>void; children:ReactNode; title?:string }){
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="backdrop" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={onClose} style={{position:'fixed', inset:0, background:'rgba(15,30,26,0.2)', zIndex:50}} />
          <motion.div initial={{x:'100%'}} animate={{x:0}} exit={{x:'100%'}} transition={{ duration:0.36, ease:[0.16,1,0.3,1] as any }} style={{position:'fixed', right:0, top:0, bottom:0, width:420, maxWidth:'90vw', background:'#fff', borderLeft:'1px solid #E2E8E5', zIndex:51, overflow:'auto', padding:20}}>
            {title && <div style={{fontWeight:700, marginBottom:12, display:'flex', justifyContent:'space-between'}}>{title} <button onClick={onClose}>✕</button></div>}
            <motion.div initial="hidden" animate="visible" variants={{ hidden:{}, visible:{ transition:{ staggerChildren:0.06 } } }}>
              {children}
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
