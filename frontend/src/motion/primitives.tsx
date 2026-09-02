import { motion, AnimatePresence, MotionConfig } from 'framer-motion'
import type { ReactNode } from 'react'

export const pageTransition = {
  initial: { opacity: 0, y: 6, scale: 0.99 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -4, scale: 0.99 },
  transition: { duration: 0.36, ease: [0.16, 1, 0.3, 1] as any }
}

export function PageTransition({ children }: { children: ReactNode }){
  return (
    <motion.div initial={pageTransition.initial} animate={pageTransition.animate} exit={pageTransition.exit} transition={pageTransition.transition}>
      {children}
    </motion.div>
  )
}

export function FadeIn({ children, delay=0 }: { children: ReactNode; delay?: number }){
  return <motion.div initial={{opacity:0}} animate={{opacity:1}} transition={{duration:0.28, delay, ease:[0.16,1,0.3,1] as any}}>{children}</motion.div>
}

export function SlideIn({ children, delay=0 }: { children: ReactNode; delay?: number }){
  return <motion.div initial={{opacity:0, y:8}} animate={{opacity:1, y:0}} transition={{duration:0.3, delay, ease:[0.16,1,0.3,1] as any}}>{children}</motion.div>
}

export function ScaleIn({ children }: { children: ReactNode }){
  return <motion.div initial={{opacity:0, scale:0.98}} animate={{opacity:1, scale:1}} transition={{duration:0.32, ease:[0.16,1,0.3,1] as any}}>{children}</motion.div>
}

export function StaggerContainer({ children }: { children: ReactNode }){
  return <motion.div initial="hidden" animate="visible" variants={{ hidden:{}, visible:{ transition:{ staggerChildren:0.06, delayChildren:0.08 } } }}>{children}</motion.div>
}

export function StaggerItem({ children }: { children: ReactNode }){
  return <motion.div variants={{ hidden:{opacity:0, y:6}, visible:{opacity:1, y:0, transition:{ duration:0.28, ease:[0.16,1,0.3,1] as any } } }}>{children}</motion.div>
}

export function MotionCard({ children, className }: { children: ReactNode; className?: string }){
  return (
    <motion.div
      className={className}
      whileHover={{ y:-2, transition:{ duration:0.18 } }}
      transition={{ duration:0.22 }}
      style={{ willChange:'transform' }}
    >{children}</motion.div>
  )
}

export function MotionButton({ children, ...props }: any){
  return <motion.button whileHover={{ scale:1.01 }} whileTap={{ scale:0.98 }} transition={{ duration:0.16 }} {...props}>{children}</motion.button>
}

export { AnimatePresence, MotionConfig, motion }
