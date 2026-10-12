import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    const registration = await navigator.serviceWorker.register('/service-worker.js')
    registration.update()
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (sessionStorage.getItem('pickleflow-sw-reloaded')) return
      sessionStorage.setItem('pickleflow-sw-reloaded', 'true')
      window.location.reload()
    })
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
