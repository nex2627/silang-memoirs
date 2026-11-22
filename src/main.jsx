import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles.css'
ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>)
// Lets the app be installed (home screen / desktop). Only in the real site, not while developing.
if('serviceWorker' in navigator && import.meta.env.PROD){ window.addEventListener('load',()=>{ navigator.serviceWorker.register('/sw.js').catch(()=>{}) }) }

// Keep the page at a fixed fit on phones: no pinch-zoom or double-tap zoom (inputs are 16px so Safari doesn't zoom on focus either).
if(window.matchMedia&&window.matchMedia('(pointer:coarse)').matches){
  ;['gesturestart','gesturechange','gestureend'].forEach(t=>document.addEventListener(t,e=>e.preventDefault(),{passive:false}))
  document.addEventListener('touchmove',e=>{ if(e.touches&&e.touches.length>1) e.preventDefault() },{passive:false})
  let last=0; document.addEventListener('touchend',e=>{ const n=Date.now(); if(n-last<300) e.preventDefault(); last=n },{passive:false})
}
