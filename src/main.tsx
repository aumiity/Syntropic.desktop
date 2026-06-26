import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { useThemeStore } from './stores/themeStore'
import { initOverscrollBounce } from './lib/overscroll-bounce'

// Apply saved appearance (dark/light class + accent CSS vars) before first render
useThemeStore.getState().applyTheme()

// Rubber-band bounce when inner scroll panes are dragged past their edge
initOverscrollBounce()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
