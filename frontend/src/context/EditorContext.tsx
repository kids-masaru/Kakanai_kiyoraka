'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Node, Edge } from 'reactflow';
import { BodyMapData } from '@/components/BodyMapEditor'; // Adjust if simple types are needed, but this import might be circular if not careful. 
// Ideally Types should be in a separate file. BodyMapData is exported from BodyMapEditor.tsx currently.
// Let's ensure types are imported from a safe place or redefined if simple.
// Actually BodyMapData is defined in BodyMapEditor.tsx.
// Let's check where Types are. genogram-utils.ts? types.ts?
// Genogram types are in @/lib/types.
// BodyMapData is in BodyMapEditor.tsx. Ideally move to @/lib/types.ts.

// For now, I will use 'any' or define simple interfaces to avoid complex refactoring just for types, 
// OR I will perform a quick refactor to move types if needed.
// Viewing `src/lib/types.ts` suggests it has Genogram types. 

interface EditorContextType {
    genogramData: { nodes: Node[], edges: Edge[] } | null;
    setGenogramData: (data: { nodes: Node[], edges: Edge[] }) => void;

    bodyMapData: any | null; // Using any to avoid circular import for now
    setBodyMapData: (data: any) => void;

    housePlanData: any | null;
    setHousePlanData: (data: any) => void;
}

const EditorContext = createContext<EditorContextType | undefined>(undefined);

export function EditorProvider({ children }: { children: React.ReactNode }) {
    const [genogramData, setGenogramData] = useState<{ nodes: Node[], edges: Edge[] } | null>(null);
    const [bodyMapData, setBodyMapData] = useState<any | null>(null);
    const [housePlanData, setHousePlanData] = useState<any | null>(null);

    return (
        <EditorContext.Provider value={{
            genogramData, setGenogramData,
            bodyMapData, setBodyMapData,
            housePlanData, setHousePlanData
        }}>
            {children}
        </EditorContext.Provider>
    );
}

export function useEditor() {
    const context = useContext(EditorContext);
    if (context === undefined) {
        throw new Error('useEditor must be used within an EditorProvider');
    }
    return context;
}
