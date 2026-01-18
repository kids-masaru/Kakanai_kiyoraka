'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Stage, Layer, Rect, Text, Line, Group, Circle, Transformer, Path } from 'react-konva';
import Konva from 'konva';
import { KaokuzuData, Room, Furniture, RoomType, FurnitureType } from '@/lib/kaokuzu-types';
import { useKaokuzuHistory } from '@/hooks/useKaokuzuHistory';
import { useEditor } from '@/context/EditorContext';
import Header from './Header';

interface HousePlanEditorProps {
    initialData?: KaokuzuData;
}

const ROOM_COLORS: Record<RoomType, string> = {
    Living: '#fff7ed', // リビング (暖色系)
    Kitchen: '#ecfdf5', // キッチン (清潔感のある緑)
    Bedroom: '#fefce8', // 寝室 (落ち着いた黄色/畳色ベース)
    Bathroom: '#ecfeff', // 浴室 (水色)
    Toilet: '#fdf4ff', // トイレ (淡いピンク)
    Entrance: '#fafaf9', // 玄関 (石材風グレー)
    Corridor: '#f3f4f6', // 廊下 (グレー)
    Other: '#ffffff', // その他
    Dining: '#ffedd5', // 食堂 (オレンジ系)
    LivingTatami: '#fef3c7', // リビング(畳)
    LivingFlooring: '#fefce8', // リビング(フローリング)
};

const ROOM_LABELS: Record<RoomType, string> = {
    Living: 'リビング',
    Kitchen: '台所',
    Bedroom: '寝室/和室',
    Bathroom: '浴室',
    Toilet: 'トイレ',
    Entrance: '玄関',
    Corridor: '廊下',
    Other: 'その他',
    Dining: '食堂',
    LivingTatami: 'リビング(畳)',
    LivingFlooring: 'リビング(床)',
};

// 家具の形状定義 (日本の間取り図記号に準拠)
const FURNITURE_SHAPES: Record<FurnitureType, any> = {
    Bed: (props: any) => (
        <Group {...props}>
            <Rect x={0} y={0} width={40} height={70} stroke="#333" strokeWidth={1} fill="white" cornerRadius={2} />
            <Rect x={5} y={5} width={30} height={15} stroke="#333" strokeWidth={1} fill="white" cornerRadius={2} />
            <Line points={[0, 25, 40, 25]} stroke="#333" strokeWidth={0.5} />
            <Text text="ベッド" fontSize={8} x={5} y={55} fill="#555" />
        </Group>
    ),
    Wheelchair: (props: any) => (
        <Group {...props}>
            <Circle x={15} y={15} radius={13} stroke="#333" strokeWidth={1} fill="white" />
            <Text text="♿" fontSize={20} x={4} y={4} />
        </Group>
    ),
    Table: (props: any) => (
        <Group {...props}>
            <Rect x={0} y={0} width={60} height={40} fill="#fefce8" stroke="#d97706" strokeWidth={1} cornerRadius={2} />
            <Text text="食卓" fontSize={10} x={20} y={15} fill="#92400e" />
        </Group>
    ),
    Toilet: (props: any) => (
        <Group {...props}>
            <Rect x={0} y={0} width={30} height={30} fill="transparent" />
            <Rect x={2} y={2} width={26} height={8} stroke="#333" strokeWidth={1} fill="white" />
            <Path data="M 5 12 Q 5 12 5 12 L 5 20 Q 5 28 15 28 Q 25 28 25 20 L 25 12 Z" stroke="#333" strokeWidth={1} fill="white" />
            <Circle x={15} y={18} radius={3} stroke="#333" strokeWidth={0.5} />
        </Group>
    ),
    Bath: (props: any) => (
        <Group {...props}>
            <Rect x={0} y={0} width={60} height={50} stroke="#333" strokeWidth={1} fill="#ecfeff" cornerRadius={2} />
            <Path data="M 5 5 L 5 45 Q 5 45 10 45 L 50 45 Q 55 45 55 40 L 55 10 Q 55 5 50 5 Z" stroke="#333" strokeWidth={1} fill="white" />
            <Circle x={50} y={10} radius={2} fill="#333" />
        </Group>
    ),
    Door: (props: any) => (
        <Group {...props}>
            <Path data="M 0 0 L 0 30 A 30 30 0 0 1 30 0 L 0 0" stroke="#333" strokeWidth={1} fill="rgba(0,0,0,0.05)" />
            <Text text="扉" fontSize={8} x={2} y={15} opacity={0.5} />
        </Group>
    ),
    Window: (props: any) => (
        <Group {...props}>
            <Rect x={0} y={0} width={40} height={6} fill="white" stroke="#94a3b8" strokeWidth={1} />
            <Line points={[0, 3, 40, 3]} stroke="#94a3b8" strokeWidth={1} />
        </Group>
    ),
    Stairs: (props: any) => (
        <Group {...props}>
            <Rect x={0} y={0} width={30} height={60} stroke="#333" strokeWidth={1} fill="white" />
            {[10, 20, 30, 40, 50].map(y => (
                <Line key={y} points={[0, y, 30, y]} stroke="#333" strokeWidth={1} />
            ))}
            <Line points={[15, 5, 15, 55]} stroke="#333" strokeWidth={1} />
            <Line points={[12, 52, 15, 55, 18, 52]} stroke="#333" strokeWidth={1} />
        </Group>
    ),
    Handrail: (props: any) => (
        <Group {...props}>
            <Rect x={0} y={0} width={40} height={8} fill="#fca5a5" cornerRadius={4} opacity={0.5} />
            <Line points={[2, 4, 38, 4]} stroke="#ef4444" strokeWidth={2} lineCap="round" />
        </Group>
    ),
    Step: (props: any) => (
        <Group {...props}>
            <Rect x={0} y={0} width={40} height={20} fill="#e5e5e5" stroke="#333" strokeWidth={1} />
            <Line points={[0, 10, 40, 10]} stroke="#333" strokeWidth={1} dash={[2, 2]} />
            <Text text="段差" fontSize={8} x={10} y={5} fill="#555" />
        </Group>
    ),
    StepLocation: (props: any) => (
        <Group {...props}>
            <Circle x={10} y={10} radius={8} fill="#fee2e2" stroke="#ef4444" strokeWidth={1} />
            <Text text="!" fontSize={10} x={8} y={5} fill="#b91c1c" fontStyle="bold" />
        </Group>
    ),
    Washroom: (props: any) => (
        <Group {...props}>
            <Rect x={0} y={0} width={40} height={30} fill="#ecfeff" stroke="#333" strokeWidth={1} />
            <Circle x={20} y={15} radius={10} stroke="#333" strokeWidth={1} fill="white" />
            <Text text="洗面" fontSize={8} x={2} y={2} fill="#555" />
        </Group>
    ),
    SlidingDoor: (props: any) => (
        <Group {...props}>
            <Line points={[0, 0, 20, 0]} stroke="#333" strokeWidth={2} />
            <Line points={[20, 5, 40, 5]} stroke="#333" strokeWidth={2} />
            <Text text="引戸" fontSize={8} x={10} y={10} fill="#555" />
        </Group>
    ),
    Futon: (props: any) => (
        <Group {...props}>
            <Rect x={0} y={0} width={40} height={70} fill="#d1fae5" stroke="#059669" strokeWidth={1} cornerRadius={2} />
            <Rect x={5} y={5} width={30} height={10} fill="white" stroke="#059669" strokeWidth={1} />
            <Text text="布団" fontSize={8} x={10} y={30} fill="#065f46" />
        </Group>
    ),
    HandrailDot: (props: any) => (
        <Group {...props}>
            <Circle x={5} y={5} radius={4} fill="#ef4444" />
        </Group>
    )
};

const SNAP_THRESHOLD = 5;

const HousePlanEditor: React.FC<HousePlanEditorProps> = ({ initialData }) => {
    const { housePlanData, setHousePlanData } = useEditor();
    const isRestoredRef = useRef(false);

    const defaultData = {
        rooms: [],
        furniture: [],
        walls: [],
        scale: 50 // 50px = 1m
    };

    const [data, setData] = useState<KaokuzuData>(defaultData);
    const { takeSnapshot, undo, redo, canUndo, canRedo } = useKaokuzuHistory(data);

    // CRITICAL: Restore from Context on mount
    useEffect(() => {
        if (!isRestoredRef.current) {
            if (housePlanData && (housePlanData.rooms?.length > 0 || housePlanData.furniture?.length > 0)) {
                console.log('HousePlan: Restoring from Context');
                setData(housePlanData);
            } else if (initialData) {
                setData({ ...defaultData, ...initialData, rooms: initialData.rooms || [], furniture: initialData.furniture || [] });
            }
            isRestoredRef.current = true;
        }
    }, []);

    // Sync to Context on Change
    useEffect(() => {
        if (!isRestoredRef.current) return;
        setHousePlanData(data);
    }, [data, setHousePlanData]);

    const stageRef = useRef<Konva.Stage>(null);
    const trRef = useRef<Konva.Transformer>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    // Selection Rectangle
    const [selectionBox, setSelectionBox] = useState<{ x: number; y: number; width: number; height: number; isSelecting: boolean } | null>(null);

    // スナップ用ガイドライン
    const [guideLines, setGuideLines] = useState<{ vertical: number[], horizontal: number[] }>({ vertical: [], horizontal: [] });

    // テンプレート機能用
    const [activeTab, setActiveTab] = useState<'rooms' | 'furniture' | 'templates'>('rooms');
    const [templates, setTemplates] = useState<string[]>([]);
    const [showTemplateSave, setShowTemplateSave] = useState(false);
    const [newTemplateName, setNewTemplateName] = useState('');

    // Save/Load State
    const [showLoadModal, setShowLoadModal] = useState(false);
    const [savedFiles, setSavedFiles] = useState<string[]>([]);

    const updateData = useCallback((newData: KaokuzuData, saveToHistory = true) => {
        // Ensure arrays exist
        const safeData = {
            ...newData,
            rooms: Array.isArray(newData.rooms) ? newData.rooms : [],
            furniture: Array.isArray(newData.furniture) ? newData.furniture : []
        };
        setData(safeData);
        if (saveToHistory) {
            takeSnapshot(safeData);
        }
    }, [takeSnapshot]);

    useEffect(() => {
        if (activeTab === 'templates') {
            fetch('/api/templates')
                .then(res => res.json())
                .then(json => {
                    if (json.templates) setTemplates(json.templates);
                })
                .catch(console.error);
        }
    }, [activeTab]);

    const saveTemplate = async () => {
        if (!newTemplateName) return;
        try {
            const res = await fetch('/api/templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newTemplateName, data }),
            });
            if (res.ok) {
                alert('テンプレートを保存しました');
                setNewTemplateName('');
                setShowTemplateSave(false);
                const list = await (await fetch('/api/templates')).json();
                if (list.templates) setTemplates(list.templates);
            } else {
                alert('保存に失敗しました');
            }
        } catch (e) {
            console.error(e);
            alert('エラーが発生しました');
        }
    };

    const loadTemplate = async (name: string) => {
        if (!confirm('現在の編集内容は失われます。ロードしますか？')) return;
        try {
            const res = await fetch(`/api/templates?name=${name}`);
            const json = await res.json();
            if (json.data) {
                updateData(json.data);
            }
        } catch (e) {
            console.error(e);
            alert('読み込みに失敗しました');
        }
    };

    // ===== Save/Load Functions =====
    const saveToServer = async () => {
        const name = prompt('保存する名前を入力してください（例：田中邸）', '');
        if (!name) return;
        try {
            // Use localStorage for Vercel compatibility
            const storageKey = 'kaokuzu_saves';
            const existingSaves = JSON.parse(localStorage.getItem(storageKey) || '{}');
            existingSaves[name] = data;
            localStorage.setItem(storageKey, JSON.stringify(existingSaves));
            alert('保存しました！');
        } catch (e) {
            alert('保存に失敗しました');
        }
    };

    const loadListFromServer = async () => {
        try {
            // Use localStorage
            const storageKey = 'kaokuzu_saves';
            const saves = JSON.parse(localStorage.getItem(storageKey) || '{}');
            const fileNames = Object.keys(saves);
            setSavedFiles(fileNames);
            setShowLoadModal(true);
        } catch (e) {
            alert('一覧の取得に失敗しました');
        }
    };

    const loadFileFromServer = async (name: string) => {
        try {
            // Use localStorage
            const storageKey = 'kaokuzu_saves';
            const saves = JSON.parse(localStorage.getItem(storageKey) || '{}');
            const loadedData = saves[name];
            if (loadedData) {
                updateData(loadedData);
                setShowLoadModal(false);
            } else {
                alert('データの読み込みに失敗しました');
            }
        } catch (e) {
            alert('読込に失敗しました');
        }
    };

    const deleteFileFromServer = async (name: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm(`「${name}」を削除しますか？`)) return;
        try {
            // Use localStorage
            const storageKey = 'kaokuzu_saves';
            const saves = JSON.parse(localStorage.getItem(storageKey) || '{}');
            delete saves[name];
            localStorage.setItem(storageKey, JSON.stringify(saves));
            setSavedFiles(prev => prev.filter(f => f !== name));
        } catch (e) {
            alert('削除エラー');
        }
    };

    const deleteTemplate = async (name: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm(`「${name}」を削除しますか？`)) return;
        try {
            await fetch(`/api/templates?name=${name}`, { method: 'DELETE' });
            const list = await (await fetch('/api/templates')).json();
            if (list.templates) setTemplates(list.templates);
        } catch (e) {
            console.error(e);
        }
    }


    // 選択 & Transformer Logic Update
    useEffect(() => {
        if (trRef.current && stageRef.current) {
            const nodes = selectedIds
                .map(id => stageRef.current?.findOne('#' + id))
                .filter((node): node is Konva.Node => node !== undefined);

            trRef.current.nodes(nodes);
            trRef.current.getLayer()?.batchDraw();
        }
    }, [selectedIds, data]);

    const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
        if (e.target === stageRef.current) {
            // Clicked on empty stage - start selection box
            const pointer = stageRef.current?.getPointerPosition();
            if (pointer) {
                setSelectionBox({
                    x: pointer.x,
                    y: pointer.y,
                    width: 0,
                    height: 0,
                    isSelecting: true
                });
                // Clear selection if not modified
                if (!e.evt.shiftKey && !e.evt.ctrlKey) {
                    setSelectedIds([]);
                }
            }
            return;
        }

        // Clicked on shape
        const clickedId = e.target.id() || e.target.getParent()?.id();
        if (clickedId) {
            const isSelected = selectedIds.includes(clickedId);
            if (e.evt.shiftKey || e.evt.ctrlKey) {
                if (isSelected) {
                    setSelectedIds(selectedIds.filter(id => id !== clickedId));
                } else {
                    setSelectedIds([...selectedIds, clickedId]);
                }
            } else {
                if (!isSelected) {
                    setSelectedIds([clickedId]);
                }
            }
        }
    };

    const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
        if (selectionBox && selectionBox.isSelecting && stageRef.current) {
            const pointer = stageRef.current.getPointerPosition();
            if (pointer) {
                setSelectionBox({
                    ...selectionBox,
                    width: pointer.x - selectionBox.x,
                    height: pointer.y - selectionBox.y
                });
            }
        }
    };

    const handleMouseUp = (e: Konva.KonvaEventObject<MouseEvent>) => {
        if (selectionBox && selectionBox.isSelecting && stageRef.current) {
            const box = {
                x: Math.min(selectionBox.x, selectionBox.x + selectionBox.width),
                y: Math.min(selectionBox.y, selectionBox.y + selectionBox.height),
                width: Math.abs(selectionBox.width),
                height: Math.abs(selectionBox.height)
            };

            // Find shapes inside the box
            const shapes = stageRef.current.find('.room, .furniture'); // We need to tag them
            const foundIds: string[] = [];
            shapes.forEach((shape) => {
                // Check intersection
                const shapeBox = shape.getClientRect();
                if (Konva.Util.haveIntersection(box, shapeBox)) {
                    foundIds.push(shape.id());
                }
            });

            // Combine with existing if shift/ctrl
            if (e.evt.shiftKey || e.evt.ctrlKey) {
                setSelectedIds(Array.from(new Set([...selectedIds, ...foundIds])));
            } else {
                setSelectedIds(foundIds);
            }

            setSelectionBox(null);
        }
    };

    // Delete selected
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectedIds.length > 0) deleteSelected();
            }
            if ((e.ctrlKey || e.metaKey)) {
                if (e.key === 'z') {
                    if (e.shiftKey) { e.preventDefault(); handleRedo(); }
                    else { e.preventDefault(); handleUndo(); }
                }
                if (e.key === 'y') { e.preventDefault(); handleRedo(); }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedIds, undo, redo]);

    const handleUndo = () => {
        const prev = undo();
        if (prev) setData(prev);
    };

    const handleRedo = () => {
        const next = redo();
        if (next) setData(next);
    };

    // --- Snapping Logic ---
    const getLineGuideStops = (skipShapeIds: string[]) => {
        const vertical: number[] = [0, 1000, 2000];
        const horizontal: number[] = [0, 1000, 2000];

        [...data.rooms, ...data.furniture].forEach(item => {
            if (skipShapeIds.includes(item.id)) return;
            const w = (item as any).width || 50;
            const h = (item as any).height || 50;
            vertical.push(item.x, item.x + w, item.x + w / 2);
            horizontal.push(item.y, item.y + h, item.y + h / 2);
        });
        return { vertical, horizontal };
    };

    const getObjectSnappingEdges = (node: Konva.Node) => {
        // スナップ計算時に影や枠線を含めない（見た目の境界でスナップさせる）
        const box = node.getClientRect({ skipStroke: true, skipShadow: true });
        const absPos = node.absolutePosition();
        return {
            vertical: [
                { guide: Math.round(box.x), offset: Math.round(absPos.x - box.x), snap: 'start' },
                { guide: Math.round(box.x + box.width / 2), offset: Math.round(absPos.x - box.x - box.width / 2), snap: 'center' },
                { guide: Math.round(box.x + box.width), offset: Math.round(absPos.x - box.x - box.width), snap: 'end' },
            ],
            horizontal: [
                { guide: Math.round(box.y), offset: Math.round(absPos.y - box.y), snap: 'start' },
                { guide: Math.round(box.y + box.height / 2), offset: Math.round(absPos.y - box.y - box.height / 2), snap: 'center' },
                { guide: Math.round(box.y + box.height), offset: Math.round(absPos.y - box.y - box.height), snap: 'end' },
            ],
        };
    };

    const onLayerDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
        const target = e.target;
        // Group dragging for multiple selection
        // Need to move other selected nodes if they are not the target but are selected
        // However, Konva Transformer handles rotation/scale. For simple drag:
        // If we drag one node, we need to calculate delta and move others.
        // BUT Transformer usually handles this if we attach it to multiple nodes?
        // Actually Transformer allows transforming multiple nodes together, but "dragging" is a property of the Node, not the transformer.
        // So we need to handle multi-drag manually if we drag *one of the shapes*.
        // If we drag the *transformer*, it modifies x/y directly.
        // Let's implement simplified snapping only for single drag for now, or just primary node.

        const guides = getLineGuideStops(selectedIds.length > 0 ? selectedIds : [target.id()]);
        const snapEdges = getObjectSnappingEdges(target);

        let minV = SNAP_THRESHOLD;
        let minH = SNAP_THRESHOLD;
        let guideV: number | null = null;
        let guideH: number | null = null;

        snapEdges.vertical.forEach(edge => {
            guides.vertical.forEach(stop => {
                const diff = Math.abs(stop - edge.guide);
                if (diff < minV) { minV = diff; guideV = stop; target.x(stop + edge.offset); }
            });
        });

        snapEdges.horizontal.forEach(edge => {
            guides.horizontal.forEach(stop => {
                const diff = Math.abs(stop - edge.guide);
                if (diff < minH) { minH = diff; guideH = stop; target.y(stop + edge.offset); }
            });
        });

        const newGuides = { vertical: [] as number[], horizontal: [] as number[] };
        if (guideV !== null) newGuides.vertical.push(guideV);
        if (guideH !== null) newGuides.horizontal.push(guideH);
        setGuideLines(newGuides);
    };

    const onLayerDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
        setGuideLines({ vertical: [], horizontal: [] });

        const targetId = e.target.id();

        // If multiple selected, we need to update ALL selected items' positions
        // But e.target gives us only the one we dragged?
        // Konva trick: if we drag one of selected, we usually want others to follow.
        // Implementing simple multi-drag:
        // 1. On DragStart, store initial positions of all selected.
        // 2. On DragMove, apply delta.
        // For now, let's just make sure "Update Data" saves valid positions.
        // Since React Konva is reactive, if we drag a node, its internal state in Konva updates. 
        // We just need to sync that back to React State.

        // HOWEVER: If we have multiple items selected, dragging ONE does NOT automatically drag others in standard Konva
        // unless they are in a Group or we manually move them.
        // For simplicity, we will update the specific item dragged. 
        // Real multi-drag is complex in this setup. 
        // Wait, if I use Transformer, dragging the *content* moves correct?
        // Actually, if selectedIds > 1, dragging one shape effectively deselects others usually unless handled.
        // But we handle selection in MouseDown.

        // Let's stick to: Dragging update only the dragged item OR if we implement full multi-drag.
        // The user asked "Select multiple and move".
        // To support that:
        // We'll trust the user drags the *selection*? No, standard behavior implies dragging any part moves the group.
        // Let's rely on Transformer for rotation/scale.
        // Use a trick: When dragging starts, if target is in selectedIds, we consider it a group drag?
        // Code below just updates the target for now.

        const isRoom = data.rooms.some(r => r.id === targetId);
        handleDragEnd(e, targetId, isRoom ? 'room' : 'furniture');
    };

    // Need to handle multi-drag specifically?
    // Let's add onDragStart logic to support moving the whole selection? 
    // Complexity check: High. 
    // Pragmantic approach: Just update the single item dragged for now, but confirm selection works.
    // User asked "Multiple selection and move".
    // I will add a simple delta implementation for Move.

    const dragStartPos = useRef<{ id: string, x: number, y: number }[]>([]);
    const onNodeDragStart = (e: Konva.KonvaEventObject<DragEvent>) => {
        const id = e.target.id();
        if (selectedIds.includes(id)) {
            // Store all selected positions
            dragStartPos.current = selectedIds.map(sid => {
                const node = stageRef.current?.findOne('#' + sid);
                return { id: sid, x: node?.x() || 0, y: node?.y() || 0 };
            });
        } else {
            dragStartPos.current = [];
        }
    };

    // Important: We need a custom DragMove handler for nodes to propagate delta IF multiple are selected
    const onNodeDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
        const id = e.target.id();
        if (selectedIds.length > 1 && selectedIds.includes(id)) {
            const start = dragStartPos.current.find(p => p.id === id);
            if (start) {
                const dx = e.target.x() - start.x;
                const dy = e.target.y() - start.y;

                selectedIds.forEach(sid => {
                    if (sid !== id) {
                        const node = stageRef.current?.findOne('#' + sid);
                        const s = dragStartPos.current.find(p => p.id === sid);
                        if (node && s) {
                            node.x(s.x + dx);
                            node.y(s.y + dy);
                        }
                    }
                });
            }
        }
        onLayerDragMove(e);
    }

    // And update Drag End to save ALL
    const onNodeDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
        setGuideLines({ vertical: [], horizontal: [] });
        // Sync all selected nodes from Konva to State
        let newData = { ...data };
        selectedIds.forEach(sid => {
            const node = stageRef.current?.findOne('#' + sid);
            if (node) {
                const x = node.x();
                const y = node.y();
                // Check if room or furn
                const rIndex = newData.rooms.findIndex(r => r.id === sid);
                if (rIndex >= 0) {
                    newData.rooms[rIndex] = { ...newData.rooms[rIndex], x, y };
                } else {
                    const fIndex = newData.furniture.findIndex(f => f.id === sid);
                    if (fIndex >= 0) {
                        newData.furniture[fIndex] = { ...newData.furniture[fIndex], x, y };
                    }
                }
            }
        });
        updateData(newData);
    }


    const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>, id: string, type: 'room' | 'furniture') => {
        // This is replaced by onNodeDragEnd for multi-support
    };

    const handleTransformEnd = (e: Konva.KonvaEventObject<Event>) => {
        // Transformer can transform multiple nodes. 
        // We need to iterate all selected nodes and update their state
        let newData = { ...data };
        selectedIds.forEach(id => {
            const node = stageRef.current?.findOne('#' + id);
            if (node) {
                const scaleX = node.scaleX();
                const scaleY = node.scaleY();
                const rotation = node.rotation();
                // Reset scale to 1 and apply to width/height to avoid compounding
                node.scaleX(1);
                node.scaleY(1);

                const rIndex = newData.rooms.findIndex(r => r.id === id);
                if (rIndex >= 0) {
                    newData.rooms[rIndex] = {
                        ...newData.rooms[rIndex],
                        x: node.x(),
                        y: node.y(),
                        width: newData.rooms[rIndex].width * scaleX,
                        height: newData.rooms[rIndex].height * scaleY,
                        rotation
                    };
                } else {
                    const fIndex = newData.furniture.findIndex(f => f.id === id);
                    if (fIndex >= 0) {
                        newData.furniture[fIndex] = {
                            ...newData.furniture[fIndex],
                            x: node.x(),
                            y: node.y(),
                            // Furniture might scale? usually fixed size but let's allow basic scaling
                            // or just rotation. Furniture usually fixed aspect?
                            rotation
                        };
                        // Note: Furniture shapes are groups. Scaling them works visually.
                    }
                }
            }
        });
        updateData(newData);
    };

    const deleteSelected = () => {
        if (selectedIds.length === 0) return;
        const newData = {
            ...data,
            rooms: data.rooms.filter(r => !selectedIds.includes(r.id)),
            furniture: data.furniture.filter(f => !selectedIds.includes(f.id))
        };
        updateData(newData);
        setSelectedIds([]);
    };

    const smartExport = () => {
        if (!stageRef.current) return;
        // Bounding Box Calc
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const allItems = [...data.rooms, ...data.furniture];

        if (allItems.length === 0) {
            alert("要素がありません");
            return;
        }

        allItems.forEach(item => {
            const width = item.width || 50;
            const height = item.height || 50;
            if (item.x < minX) minX = item.x;
            if (item.y < minY) minY = item.y;
            if (item.x + width > maxX) maxX = item.x + width;
            if (item.y + height > maxY) maxY = item.y + height;
        });

        const padding = 50;
        minX -= padding; minY -= padding; maxX += padding; maxY += padding;

        const dataUrl = stageRef.current.toDataURL({
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
            pixelRatio: 2
        });

        const link = document.createElement('a');
        link.download = 'kaokuzu.png';
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const addRoom = (type: RoomType = 'Living') => {
        const newRoom: Room = {
            id: `room_${Date.now()}`,
            name: ROOM_LABELS[type],
            type: type,
            x: 350,
            y: 200,
            width: type === 'Toilet' ? 80 : 150,
            height: type === 'Toilet' ? 80 : 150,
            rotation: 0
        };
        updateData({ ...data, rooms: [...data.rooms, newRoom] });
    };

    const addFurniture = (type: FurnitureType) => {
        const newFurn: Furniture = {
            id: `furn_${Date.now()}`,
            type: type,
            x: 400,
            y: 250,
            width: 50,
            height: 50,
            rotation: 0
        };
        updateData({ ...data, furniture: [...data.furniture, newFurn] });
    };

    return (
        <div className="flex flex-col h-screen bg-gray-50 font-sans text-slate-700 overflow-hidden relative" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
            <Header />

            <div className="flex-1 flex overflow-hidden">
                {/* Sidebar (Static Width) */}
                <div className="w-64 bg-white border-r border-gray-200 flex flex-col z-20 shadow-md">
                    {/* Panel Tabs */}
                    <div className="flex border-b border-gray-200 bg-gray-100">
                        <button
                            onClick={() => setActiveTab('rooms')}
                            className={`flex-1 py-3 text-xs font-bold text-center transition-colors ${activeTab === 'rooms' ? 'bg-white text-blue-600 border-t-2 border-blue-600' : 'text-gray-500 hover:bg-gray-200'}`}
                        >
                            🏠 部屋
                        </button>
                        <button
                            onClick={() => setActiveTab('furniture')}
                            className={`flex-1 py-3 text-xs font-bold text-center transition-colors ${activeTab === 'furniture' ? 'bg-white text-blue-600 border-t-2 border-blue-600' : 'text-gray-500 hover:bg-gray-200'}`}
                        >
                            🛋️ 家具
                        </button>
                        <button
                            onClick={() => setActiveTab('templates')}
                            className={`flex-1 py-3 text-xs font-bold text-center transition-colors ${activeTab === 'templates' ? 'bg-white text-purple-600 border-t-2 border-purple-600' : 'text-gray-500 hover:bg-gray-200'}`}
                        >
                            📄 テンプレ
                        </button>
                    </div>

                    {/* Scrollable Content Area */}
                    <div className="flex-1 overflow-y-auto p-4 max-h-[60vh] custom-scrollbar bg-white">
                        {activeTab === 'rooms' && (
                            <div className="grid grid-cols-2 gap-2">
                                {Object.keys(ROOM_COLORS).map((type) => (
                                    <button
                                        key={type}
                                        onClick={() => addRoom(type as RoomType)}
                                        className="flex flex-col items-center justify-center p-2 rounded-lg border border-slate-100 hover:border-blue-200 hover:bg-blue-50 transition-all group"
                                    >
                                        <div className="w-8 h-8 rounded mb-1 border shadow-sm" style={{ background: ROOM_COLORS[type as RoomType] }}></div>
                                        <span className="text-xs font-medium text-gray-600 group-hover:text-blue-700">{ROOM_LABELS[type as RoomType]}</span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {activeTab === 'furniture' && (
                            <div className="grid grid-cols-2 gap-2">
                                {Object.keys(FURNITURE_SHAPES).map((type) => {
                                    let label = type;
                                    let icon = '📦';
                                    switch (type) {
                                        case 'Bed': label = 'ベッド'; icon = '🛏️'; break;
                                        case 'Wheelchair': label = '車椅子'; icon = '♿'; break;
                                        case 'Table': label = '机'; icon = '🪑'; break;
                                        case 'Toilet': label = 'トイレ'; icon = '🚽'; break;
                                        case 'Bath': label = '浴室'; icon = '🛁'; break;
                                        case 'Door': label = '扉'; icon = '🚪'; break;
                                        case 'Window': label = '窓'; icon = '🪟'; break;
                                        case 'Stairs': label = '階段'; icon = '🪜'; break;
                                        case 'Handrail': label = '手すり'; icon = '🦯'; break;
                                        case 'Step': label = '段差'; icon = '🪜'; break;
                                        case 'StepLocation': label = '段差箇所'; icon = '⚠️'; break;
                                        case 'Washroom': label = '洗面所'; icon = '🚰'; break;
                                        case 'SlidingDoor': label = '引き戸'; icon = '🚪'; break;
                                        case 'Futon': label = '布団'; icon = '🛌'; break;
                                        case 'HandrailDot': label = '縦手すり'; icon = '📍'; break;
                                    }

                                    return (
                                        <button
                                            key={type}
                                            onClick={() => addFurniture(type as FurnitureType)}
                                            className="flex flex-col items-center justify-center p-2 rounded-lg border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50 transition-all group"
                                        >
                                            <span className="text-xl mb-1 opacity-80 group-hover:scale-110 transition-transform">{icon}</span>
                                            <span className="text-xs font-medium text-gray-600 group-hover:text-emerald-700">
                                                {label}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {activeTab === 'templates' && (
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <h3 className="text-xs font-bold text-gray-500">保存済みテンプレート</h3>
                                    {templates.length === 0 && <p className="text-xs text-gray-400">テンプレートはありません</p>}
                                    <div className="space-y-1">
                                        {templates.map(tpl => (
                                            <div key={tpl} className="flex items-center gap-2 group">
                                                <button
                                                    onClick={() => loadTemplate(tpl)}
                                                    className="flex-1 text-left text-xs py-2 px-3 bg-gray-50 hover:bg-purple-50 hover:text-purple-600 rounded border border-gray-100 transition-colors"
                                                >
                                                    📄 {tpl}
                                                </button>
                                                <button
                                                    onClick={(e) => deleteTemplate(tpl, e)}
                                                    className="p-1 text-gray-400 hover:text-red-500"
                                                    title="削除"
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <hr className="border-gray-100" />

                                <div className="space-y-2">
                                    {!showTemplateSave ? (
                                        <button
                                            onClick={() => setShowTemplateSave(true)}
                                            className="w-full py-2 bg-purple-50 text-purple-600 border border-purple-200 rounded text-xs font-bold hover:bg-purple-100 transition-colors"
                                        >
                                            ＋ 現在の状態を保存
                                        </button>
                                    ) : (
                                        <div className="bg-gray-50 p-2 rounded border border-gray-200">
                                            <input
                                                type="text"
                                                placeholder="テンプレート名"
                                                className="w-full text-xs p-1 mb-2 border border-gray-300 rounded"
                                                value={newTemplateName}
                                                onChange={e => setNewTemplateName(e.target.value)}
                                            />
                                            <div className="flex gap-1">
                                                <button
                                                    onClick={saveTemplate}
                                                    className="flex-1 py-1 bg-purple-600 text-white rounded text-xs font-bold hover:bg-purple-700"
                                                >
                                                    保存
                                                </button>
                                                <button
                                                    onClick={() => setShowTemplateSave(false)}
                                                    className="flex-1 py-1 bg-white border border-gray-300 rounded text-xs hover:bg-gray-50"
                                                >
                                                    キャンセル
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer Actions (Fixed at bottom of sidebar) */}
                    <div className="p-3 bg-white border-t border-gray-200 space-y-2 z-10">
                        {/* Save/Load Buttons */}
                        <div className="flex gap-2">
                            <button onClick={saveToServer} className="flex-1 py-2 bg-green-50 text-green-600 border border-green-200 rounded text-xs font-bold hover:bg-green-100">💾 保存</button>
                            <button onClick={loadListFromServer} className="flex-1 py-2 bg-gray-50 text-gray-600 border border-gray-200 rounded text-xs font-bold hover:bg-gray-100">📂 読込</button>
                        </div>

                        <button
                            onClick={smartExport}
                            className="w-full py-2 bg-white border border-blue-200 text-blue-600 rounded-md text-xs font-bold shadow-sm hover:bg-blue-50 transition-all flex items-center justify-center gap-2"
                        >
                            📸 画像として保存
                        </button>

                        <div className="flex gap-2">
                            <button
                                onClick={handleUndo}
                                disabled={!canUndo}
                                className="flex-1 py-1.5 bg-white border border-gray-200 rounded text-gray-500 text-xs hover:bg-gray-50 disabled:opacity-50"
                            >
                                ↩ Undo
                            </button>
                            <button
                                onClick={handleRedo}
                                disabled={!canRedo}
                                className="flex-1 py-1.5 bg-white border border-gray-200 rounded text-gray-500 text-xs hover:bg-gray-50 disabled:opacity-50"
                            >
                                ↪ Redo
                            </button>
                        </div>
                        <button onClick={deleteSelected} disabled={selectedIds.length === 0} className="w-full py-1.5 bg-red-50 text-red-600 rounded text-xs hover:bg-red-100 disabled:opacity-50 disabled:bg-transparent disabled:text-gray-300">🗑️ 削除</button>
                    </div>
                </div>

                {/* Canvas Area (Flex Grow) */}
                <div className="flex-1 relative bg-slate-50 overflow-hidden cursor-crosshair">
                    {/* Background Grid */}
                    <div className="absolute inset-0 opacity-10 pointer-events-none" style={{
                        backgroundImage: 'linear-gradient(#cbd5e1 1px, transparent 1px), linear-gradient(90deg, #cbd5e1 1px, transparent 1px)',
                        backgroundSize: '50px 50px'
                    }}></div>

                    <Stage
                        width={3000}
                        height={2000}
                        ref={stageRef}
                        className="cursor-crosshair active:cursor-grabbing"
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                    >
                        <Layer>
                            {data.rooms.map((room) => (
                                <Group
                                    key={room.id}
                                    id={room.id}
                                    name="room" // Tag for selection logic
                                    x={room.x}
                                    y={room.y}
                                    draggable
                                    onDragStart={onNodeDragStart}
                                    onDragMove={onNodeDragMove}
                                    onDragEnd={onNodeDragEnd}
                                    onTransformEnd={handleTransformEnd}
                                >
                                    <Rect
                                        width={room.width}
                                        height={room.height}
                                        fill={ROOM_COLORS[room.type] || '#fff'}
                                        stroke={selectedIds.includes(room.id) ? '#3b82f6' : '#94a3b8'}
                                        strokeWidth={selectedIds.includes(room.id) ? 2 : 1}
                                        shadowColor="black"
                                        shadowBlur={selectedIds.includes(room.id) ? 10 : 0}
                                        shadowOpacity={0.1}
                                    />
                                    <Text
                                        text={room.name}
                                        fontSize={14}
                                        x={5}
                                        y={5}
                                        fill={selectedIds.includes(room.id) ? '#3b82f6' : '#64748b'}
                                        fontStyle="bold"
                                    />
                                    <Text
                                        text={`${(room.width / data.scale).toFixed(1)}m x ${(room.height / data.scale).toFixed(1)}m`}
                                        fontSize={10}
                                        x={5}
                                        y={25}
                                        fill="#94a3b8"
                                    />
                                </Group>
                            ))}

                            {data.furniture.map((item) => {
                                const ShapeComponent = FURNITURE_SHAPES[item.type];
                                if (!ShapeComponent) return null;
                                return (
                                    <Group
                                        key={item.id}
                                        id={item.id}
                                        name="furniture" // Tag for selection
                                        x={item.x}
                                        y={item.y}
                                        draggable
                                        onDragStart={onNodeDragStart}
                                        onDragMove={onNodeDragMove}
                                        onDragEnd={onNodeDragEnd}
                                        onTransformEnd={handleTransformEnd}
                                    >
                                        <ShapeComponent />
                                        <Rect width={40} height={40} fill="transparent" />
                                        {selectedIds.includes(item.id) && (
                                            <Circle x={20} y={20} radius={30} stroke="#3b82f6" strokeWidth={1} dash={[4, 4]} opacity={0.5} />
                                        )}
                                    </Group>
                                );
                            })}

                            {/* Guide Lines */}
                            {guideLines.vertical.map((x, i) => (
                                <Line key={`h-${i}`} points={[x, 0, x, 2000]} stroke="#f43f5e" strokeWidth={1} dash={[4, 4]} />
                            ))}
                            {guideLines.horizontal.map((y, i) => (
                                <Line key={`v-${i}`} points={[0, y, 3000, y]} stroke="#f43f5e" strokeWidth={1} dash={[4, 4]} />
                            ))}

                            {/* Selection Box Visual */}
                            {selectionBox && selectionBox.isSelecting && (
                                <Rect
                                    x={selectionBox.x}
                                    y={selectionBox.y}
                                    width={selectionBox.width}
                                    height={selectionBox.height}
                                    fill="rgba(59, 130, 246, 0.1)"
                                    stroke="#3b82f6"
                                    strokeWidth={1}
                                />
                            )}

                            <Transformer
                                ref={trRef}
                                borderStroke="#3b82f6"
                                anchorStroke="#3b82f6"
                                anchorFill="white"
                                anchorSize={10}
                                borderDash={[4, 4]}
                                rotationSnaps={[0, 90, 180, 270]}
                            />
                        </Layer>
                    </Stage>

                    <div className="absolute bottom-4 right-4 bg-white/80 backdrop-blur px-4 py-2 rounded-full text-xs text-slate-500 shadow-sm border border-slate-200 font-mono">
                        Scale: 1m = 50px
                    </div>
                </div>
            </div>

            {/* Load Modal */}
            {showLoadModal && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white p-6 rounded-2xl w-full max-w-md shadow-2xl">
                        <h3 className="font-bold mb-4 text-xl flex items-center gap-2 text-gray-800">📂 保存された家屋図</h3>
                        <div className="max-h-[60vh] overflow-y-auto border border-gray-100 rounded-xl bg-gray-50">
                            {savedFiles.length === 0 ? (
                                <div className="p-8 text-center text-gray-400">データがありません</div>
                            ) : (
                                <ul className="p-2 space-y-1">
                                    {savedFiles.map(file => (
                                        <li key={file} className="flex items-center group bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all overflow-hidden">
                                            <button
                                                onClick={() => loadFileFromServer(file)}
                                                className="flex-1 text-left p-3 text-gray-700 font-medium hover:text-blue-600 transition-colors flex items-center gap-2"
                                            >
                                                <span className="text-xl">🏠</span> {file}
                                            </button>
                                            <button
                                                onClick={(e) => deleteFileFromServer(file, e)}
                                                className="p-3 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors border-l border-gray-100"
                                                title="削除"
                                            >
                                                🗑️
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <button
                            onClick={() => setShowLoadModal(false)}
                            className="mt-6 w-full py-3 bg-gray-800 text-white rounded-xl font-bold hover:bg-gray-900 transition-all shadow-lg shadow-gray-200"
                        >
                            閉じる
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HousePlanEditor;

