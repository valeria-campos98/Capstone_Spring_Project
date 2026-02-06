
import React, {useState} from 'react';
import * as FaIcons from "react-icons/fa6";
import {Link} from 'react-router-dom';
import * as IoIcons from 'react-icons/io';

function Navbar() {
    const [sidebar, setSidebar] = useState(false)
    {/*false means sidebar is hidden */}
    {/*true means sidebar is visible*/}
    const showSidebar = () => setSidebar(!sidebar);
    {/*toggle function, if it is false it becomes true, if it is true, it becomes false
       Function is meant to be called when clicking menu icons
    */}
  return (
    <div>
        <div className="navbar">
            <Link to="/" className ="menu-bars">
            <FaIcons.FaBars/>
            </Link>
         </div>
         <nav className={sidebar ? 'nav-menu active': 'nav-menu'}>
            {/* Dynamically changes CSS class, if sidebar is true then nav-menu active otherwhise nav-menu
              This controls whether the sidebar slides in/out*/ }
            <ul className='nav-menu-items'>
                <li className="navbar -toggle">
                    <Link to = "#" className='menu-bars'>
                    <IoIcons.IoIosCloseCircle />
                    </Link>
                </li>
            </ul>
         </nav>
    </div>
  );
}

 {/* How Navbar is supposed to work
    1. User clicks the bars icon
    2. sidebar becomes true
    3. sidebar slides in
    4. User click x button
    5. sidebar becomes false
    6. sidebar closes
*/}

export default Navbar