'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const BodyMapEditor = dynamic(() => import('@/components/BodyMapEditor'), {
    ssr: false,
    loading: () => <div className="flex items-center justify-center h-screen">Loading Editor...</div>
});

export default function BodyMapPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <BodyMapEditor />
        </Suspense>
    );
}
