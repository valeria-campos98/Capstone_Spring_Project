import * as FaIcons from "react-icons/fa6";
import * as IoIcons from 'react-icons/io';
import * as MdIcons from 'react-icons/md'; 
import * as PiIcons from 'react-icons/pi';
import logoTransparent from '../assets/logoTransparent.png';

/*go up one folder level */

/* This is an array*/
export const SidebarData = [

     {
        title: 'Home',
        path:'/',
        icon: <MdIcons.MdSpaceDashboard/>,
        cName: 'nav-text'    
    },

    {
        title: 'Dashboard',
        path:'/dashboard',
        icon: <MdIcons.MdSpaceDashboard / >,
        cName: 'nav-text'    
    },

    {
        title: 'Upload and Generate',
        path:'/upload_generate',
        icon: <MdIcons.MdFileUpload / >,
        cName: 'nav-text'    
    },
    
     {
        title: 'Details',
        path:'/details',
        icon: <PiIcons.PiFileMagnifyingGlassThin / >,
        cName: 'nav-text'    
    },

     {
        title: 'Settings',
        path:'/settings',
        icon: <IoIcons.IoMdSettings / >,
        cName: 'nav-text'    
    }
]