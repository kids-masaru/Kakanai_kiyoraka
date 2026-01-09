'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Header() {
    const pathname = usePathname();

    const isActive = (path: string) => {
        if (path === '/' && pathname === '/') return true;
        if (path !== '/' && pathname.startsWith(path)) return true;
        return false;
    };

    return (
        <div className="fixed top-0 left-0 right-0 h-14 bg-white border-b border-gray-200 px-4 flex items-center shadow-sm z-50">
            <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-gray-700">CareDX Editor</span>
            </div>
            <div className="mx-6 h-6 w-px bg-gray-300"></div>
            <div className="flex bg-gray-100 p-1 rounded-lg">
                <Link href="/" className={`px-4 py-1.5 text-sm font-medium transition-all rounded-md ${isActive('/') ? 'bg-white text-blue-600 shadow-sm font-bold' : 'text-gray-500 hover:text-gray-700'}`}>
                    👨‍👩‍👧‍👦 ジェノグラム
                </Link>
                <Link href="/house-plan" className={`px-4 py-1.5 text-sm font-medium transition-all rounded-md ${isActive('/house-plan') ? 'bg-white text-blue-600 shadow-sm font-bold' : 'text-gray-500 hover:text-gray-700'}`}>
                    🏠 家屋図
                </Link>
                <Link href="/body-map" className={`px-4 py-1.5 text-sm font-medium transition-all rounded-md ${isActive('/body-map') ? 'bg-white text-blue-600 shadow-sm font-bold' : 'text-gray-500 hover:text-gray-700'}`}>
                    👤 身体図
                </Link>
            </div>
        </div>
    );
}
