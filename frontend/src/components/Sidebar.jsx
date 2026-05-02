import * as FaIcons from "react-icons/fa6";
import * as IoIcons from 'react-icons/io';
import * as MdIcons from 'react-icons/md'; 
import * as PiIcons from 'react-icons/pi';
import { MdOutlineWarehouse } from 'react-icons/md';

export const SidebarData = [
    
    {
        title: 'Dashboard',
        path:'/dashboard',
        icon: <MdIcons.MdSpaceDashboard />,
        cName: 'nav-text'    
    },
    {
        title: 'Upload and Generate',
        path:'/upload_generate',
        icon: <MdIcons.MdFileUpload />,
        cName: 'nav-text'    
    },
    {
        title: 'Warehouse',
        path:'/warehouse',
        icon: <MdOutlineWarehouse />,
        cName: 'nav-text'    
    },
    {
        title: 'Details',
        path:'/details',
        icon: <PiIcons.PiFileMagnifyingGlassThin />,
        cName: 'nav-text'    
    },
    {
        title: 'Settings',
        path:'/settings',
        icon: <IoIcons.IoMdSettings />,
        cName: 'nav-text'    
    }
]