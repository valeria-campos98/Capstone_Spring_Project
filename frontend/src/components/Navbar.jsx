
import React, {useState} from 'react';
import * as FaIcons from "react-icons/fa6";
import {Link} from 'react-router-dom';
/*import * as IoIcons from 'react-icons/io'; */
import * as AiIcons from 'react-icons/ai';

import { SidebarData } from './Sidebar';
import './Navbar.css';
import {IconContext} from 'react-icons'
import logoTransparent from '../assets/logoTransparent.png';
import { FaXmark } from "react-icons/fa6";





function Navbar() {
    const [sidebar, setSidebar] = useState(false)
    {/*false means sidebar is hidden */}
    {/*true means sidebar is visible*/}
    const showSidebar = () => setSidebar(!sidebar);
    {/*toggle function, if it is false it becomes true, if it is true, it becomes false
       Function is meant to be called when clicking menu icons
    */}
  return (
    <>
    <IconContext.Provider value = {{color: 'white'}}> 
        <div className="navbar">
            <Link to="#" className ='menu-bars' >
            {/*<FaIcons.FaBars onClick={showSidebar}/>*/ }
            <img
                src = {logoTransparent}
                alt = "logoMenu"
                className = "navbar-logo"
                onClick={showSidebar}
            />
           
            </Link>
         </div>

         <nav className={sidebar ? 'nav-menu active': 'nav-menu'}>
            {/* Dynamically changes CSS class, if sidebar is true then nav-menu active otherwhise nav-menu
              This controls whether the sidebar slides in/out*/ }
            <ul className='nav-menu-items' >
                <li className="navbar-toggle">
                    <Link to = "#" className='menu-bars' onClick={showSidebar}  >
                    <AiIcons.AiOutlineClose />
                    
                    </Link>
                </li>
                {SidebarData.map((item,index) => {
                    return(
                        <li key ={index} className ={item.cName}>
                            <Link to={item.path} >
                             {item.icon}
                             <span>{item.title}</span>
                            
                            </Link>
                        </li>
                    );
                })}
            </ul>
         </nav>
         </IconContext.Provider>
    </>
  );
}

 /* How Navbar is supposed to work
    1. User clicks the bars icon
    2. sidebar becomes true
    3. sidebar slides in
    4. User click x button
    5. sidebar becomes false
    6. sidebar closes
*/

export default Navbar