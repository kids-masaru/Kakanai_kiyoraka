'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const HousePlanEditor = dynamic(() => import('@/components/HousePlanEditor'), {
    ssr: false,
    loading: () => <div className="flex items-center justify-center h-screen">Loading Editor...</div>
});

export default function HousePlanPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <HousePlanEditor />
        </Suspense>
    );
}
