import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

// 防止手機（尤其 iOS Safari，touch-action / user-scalable 對其無效）的縮放手勢：
// 1) 攔截 300ms 內的第二次點擊（double-tap 放大）；2) 攔截 pinch 手勢起始。
let lastTouchEnd = 0
document.addEventListener('touchend', (e) => {
  const now = Date.now()
  if (now - lastTouchEnd <= 320) e.preventDefault()
  lastTouchEnd = now
}, { passive: false })
document.addEventListener('gesturestart', (e) => e.preventDefault())

createApp(App).mount('#app')
