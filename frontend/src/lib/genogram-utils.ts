
import { Node, Edge } from 'reactflow';
import { Person } from '@/lib/types';

export const convertToReactFlow = (data: any): { nodes: Node[], edges: Edge[] } => {
    // --- New Format Detection (AI Output with nodes/edges) ---
    if (data.nodes && Array.isArray(data.nodes)) {
        console.log('Detected NEW AI format (nodes/edges):', data.nodes.length, 'nodes');

        // Filter out null/undefined nodes first
        const validNodes = data.nodes.filter((n: any) => n && typeof n === 'object');

        // Already in ReactFlow-like format, normalize it
        const nodes: Node[] = validNodes.map((n: any, idx: number) => ({
            id: n.id || `node-${idx}`,
            type: n.type || 'person',
            position: n.position || { x: 100 + idx * 180, y: 100 },
            data: {
                person: {
                    id: n.id || `node-${idx}`,
                    name: n.data?.label || '不明',
                    // Safe access to gender with fallback
                    gender: (n.data && n.data.gender === 'male') ? 'M'
                        : (n.data && n.data.gender === 'female') ? 'F'
                            : 'U',
                    isDeceased: n.data?.deceased || false,
                    isSelf: n.data?.label === '本人',
                    isKeyPerson: false,
                    generation: 0,
                }
            },
        }));
        const edges: Edge[] = (data.edges || []).filter((e: any) => e && e.source && e.target).map((e: any, idx: number) => ({
            id: e.id || `edge-${idx}`,
            source: e.source,
            target: e.target,
            type: e.type === 'marriage' ? 'straight' : 'smoothstep',
            style: { stroke: '#333', strokeWidth: 2 },
        }));
        return { nodes, edges };
    }

    // --- Legacy Format (members/marriages) ---
    console.log('Detected LEGACY format (members/marriages)');
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const members = data.members || [];
    const marriages = data.marriages || [];

    const memberMap = new Map<string, any>(members.map((m: any) => [m.id, m]));

    // 世代ごとにグループ化
    const generations: { [key: number]: any[] } = {};
    members.forEach((m: any) => {
        const gen = m.generation || 0;
        if (!generations[gen]) generations[gen] = [];
        generations[gen].push(m);
    });

    // 配置パラメータ
    const startX = 100;
    const startY = 100;
    const nodeIntervalX = 180; // ノード間の横幅（広めに）
    const nodeIntervalY = 160; // 世代間の縦幅

    // 処理済みのメンバーID
    const processedMembers = new Set<string>();

    // 世代順に配置
    const sortedGens = Object.keys(generations).map(Number).sort((a, b) => a - b); // 昇順（親->子）

    // 各世代の現在のX座標
    let currentX = startX;

    // レイアウト計算用の一時マップ
    const nodePositions = new Map<string, { x: number, y: number }>();
    const marriagePositions = new Map<number, { x: number, y: number }>(); // index -> pos

    sortedGens.forEach((gen, genIndex) => {
        const genMembers = generations[gen];
        const y = startY + genIndex * nodeIntervalY;

        // X座標をリセット（中央揃えなどはせず、左詰めで配置）
        currentX = startX + (genIndex * 50); // 少しずらして階層感

        // 1. まず夫婦関係があるメンバーを優先して配置
        marriages.forEach((m: any, mIndex: number) => {
            const husband = memberMap.get(m.husband);
            const wife = m.wife ? memberMap.get(m.wife) : undefined;

            // この世代に属する夫婦か確認（夫の世代を基準）
            if (husband && husband.generation === gen) {
                // 夫が未配置なら配置
                if (!processedMembers.has(m.husband)) {
                    nodePositions.set(m.husband, { x: currentX, y });
                    processedMembers.add(m.husband);
                    currentX += nodeIntervalX;
                }

                // 妻が未配置なら配置（夫の隣に）
                if (wife && !processedMembers.has(m.wife)) {
                    nodePositions.set(m.wife, { x: currentX, y });
                    processedMembers.add(m.wife);
                    currentX += nodeIntervalX;
                }

                // 結婚点（中間）の座標計算
                const hPos = nodePositions.get(m.husband)!;
                const wPos = wife ? nodePositions.get(m.wife)! : { x: hPos.x + 100, y };
                const mX = (hPos.x + wPos.x) / 2;
                // PersonNodeのハンドル中心(15)とMarriageNodeのハンドル中心(15)を合わせるため、Y座標は同じにする
                const mY = y;

                marriagePositions.set(mIndex, { x: mX, y: mY });
            }
        });

        // 2. まだ配置されていない残りのメンバーを配置（独身など）
        genMembers.forEach((member: any) => {
            if (!processedMembers.has(member.id)) {
                nodePositions.set(member.id, { x: currentX, y });
                processedMembers.add(member.id);
                currentX += nodeIntervalX;
            }
        });
    });

    // ノード生成
    members.forEach((member: any) => {
        const pos = nodePositions.get(member.id) || { x: 0, y: 0 };
        const person: Person = {
            id: member.id,
            name: member.name || '不明',
            gender: member.gender || 'U',
            birthYear: member.birthYear,
            isDeceased: member.isDeceased || false,
            isSelf: member.isSelf || false,
            isKeyPerson: member.isKeyPerson || false,
            generation: member.generation || 0,
            note: member.note,
        };

        nodes.push({
            id: member.id,
            type: 'person',
            position: pos,
            data: { person },
        });
    });

    // 結婚・エッジ生成
    marriages.forEach((m: any, index: number) => {
        const mPos = marriagePositions.get(index);
        if (!mPos) return;

        // 結婚ノード（中間点）
        const marriageNodeId = `marriage-node-${index}`;
        nodes.push({
            id: marriageNodeId,
            type: 'marriage',
            position: mPos,
            data: { status: m.status },
            draggable: false, // 中間点は動かせない方がいいかも
        });

        // 夫婦 -> 中間点 へのエッジ
        if (m.husband) {
            edges.push({
                id: `edge-husband-${index}`,
                source: m.husband,
                target: marriageNodeId,
                sourceHandle: 'right-source', // 夫の右から
                targetHandle: 'left-target', // 中間点の左へ
                type: 'straight', // 直線
                style: { stroke: '#333', strokeWidth: 2 },
            });
        }
        if (m.wife) {
            edges.push({
                id: `edge-wife-${index}`,
                source: m.wife,
                target: marriageNodeId,
                sourceHandle: 'left-source', // 妻の左から
                targetHandle: 'right-target', // 中間点の右へ
                type: 'straight', // 直線
                style: { stroke: '#333', strokeWidth: 2 },
            });
        }

        // 子供へのエッジ
        (m.children || []).forEach((childId: string, childIndex: number) => {
            edges.push({
                id: `child-${index}-${childIndex}`,
                source: marriageNodeId,
                target: childId,
                sourceHandle: 'bottom-source', // 中間点の下から
                targetHandle: 'top', // 子供の上へ
                type: 'smoothstep', // カクッと曲がる線
                style: { stroke: '#333', strokeWidth: 2 },
            });
        });
    });

    return { nodes, edges };
};
