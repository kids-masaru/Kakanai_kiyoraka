import { useState, useCallback } from 'react';
import { Node, Edge } from 'reactflow';

interface HistoryState {
    nodes: Node[];
    edges: Edge[];
}

export const useHistory = (initialNodes: Node[], initialEdges: Edge[]) => {
    const [history, setHistory] = useState<HistoryState[]>([{ nodes: initialNodes, edges: initialEdges }]);
    const [pointer, setPointer] = useState(0);

    const takeSnapshot = useCallback((nodes: Node[], edges: Edge[]) => {
        setHistory((prev) => {
            const newHistory = prev.slice(0, pointer + 1);
            newHistory.push({ nodes, edges });
            return newHistory;
        });
        setPointer((prev) => prev + 1);
    }, [pointer]);

    const undo = useCallback(() => {
        if (pointer > 0) {
            setPointer((prev) => prev - 1);
            return history[pointer - 1];
        }
        return null;
    }, [history, pointer]);

    const redo = useCallback(() => {
        if (pointer < history.length - 1) {
            setPointer((prev) => prev + 1);
            return history[pointer + 1];
        }
        return null;
    }, [history, pointer]);

    const canUndo = pointer > 0;
    const canRedo = pointer < history.length - 1;

    return {
        takeSnapshot,
        undo,
        redo,
        canUndo,
        canRedo,
    };
};
