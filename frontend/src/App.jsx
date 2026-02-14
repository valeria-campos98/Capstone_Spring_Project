import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css';
import Navbar from './components/Navbar';
import {BrowserRouter as Router, Routes, Route } from 'react-router-dom' ;
import Details from './pages/Details';
import Dashboard_Tab from './pages/Dashboard_Tab';
import Settings_Tab from './pages/Settings_Tab';
import Upload_Generate from './pages/Upload_Generate';
import Home from './pages/Home';


function App() {

  return (
    <>
      
    <Router>
      <Navbar/>
      <Routes>
        <Route path = '/' element ={<Home/>}/>
        <Route path='/dashboard'  element={<Dashboard_Tab/>}/>
        <Route path= '/details' element={<Details/>}/>
        <Route path= '/settings' element= {<Settings_Tab/>}/>
        <Route path='/upload_generate' element = {<Upload_Generate/>} />
      </Routes>
    </Router>
    </>
  );
}

/*
 <Navbar/> Renders a navigation bar component & because it is outside of <Routes>, it will appear on every page,regardless of the route
 <Routes> is a container for the route definitions , it decides which conponent to render based ont the url
 <Route path ='/'/> defines a route for the home URL (/) as of now there is no element
*/

export default App
