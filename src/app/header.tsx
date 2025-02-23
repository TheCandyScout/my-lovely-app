        
'use client';
import Link from 'next/link'
import { usePathname } from 'next/navigation'


export default function Home() { 
    const pathname = usePathname();
    return(
    <nav>
        <div className="logo">
            <Link href='/'>
                <img src= '/my-lovely-app/images/Awkward-4x.gif' alt="logo"/>
            </Link>
        </div>
        <nav className="navbar background">

            <ul className="nav-list">
                <hr className="ends"/> 
                <li><Link href="/blog" className={pathname === "/blog" ? "current" : ""}>blog</Link></li>
                <hr className="solid"/>
                <li><Link href="/filmscanning" className={pathname === "/filmscanning" ? "current" : ""}>filmscanning</Link></li>
                <hr className="solid"/> 
                <li><Link href="/about" className={pathname === "/about" ? "current" : ""}>about</Link></li>
                <hr className="solid"/> 
                <li><Link href="/contact" className={pathname === "/contact" ? "current" : ""}>contact</Link></li>
                <hr className="ends"/> 
            </ul>

        </nav>
    </nav>
    );
}