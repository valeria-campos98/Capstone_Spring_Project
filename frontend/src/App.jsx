import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import Navbar from './components/Navbar'
import {BrowserRouter as Router, Routes, Route } from 'react-router-dom' 

function App() {

  return (
    <>
      
    <Router>
      <Navbar/>
      <Routes>
        <Route path='/'/>
      </Routes>
    </Router>
    </>
  );
}

export default App
