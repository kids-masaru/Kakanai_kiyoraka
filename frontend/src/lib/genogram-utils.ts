
import { Node, Edge } from 'reactflow';
import { Person } from '@/lib/types';

export const convertToReactFlow = (data: any): { nodes: Node[], edges: Edge[] } => {
    // --- New Format Detection (AI Output with nodes/edges) ---
    if (data.nodes && Array.isArray(data.nodes)) {
        console.log('Detected NEW AI format (nodes/edges):', data.nodes.length, 'nodes');

        // Filter out null/undefined nodes first
        const validNodes = data.nodes.filter((n: any) => n && typeof n === 'object');

        // --- 0. Pre-process Sibling Edges -> Implicit Parents ---
        const edges: Edge[] = [];
        const additionalNodes: Node[] = [];
        const rawInputEdges = data.edges || [];

        // Helper to detect sibling edges
        const isSiblingEdge = (e: any): boolean => {
            return e.data?.label && /姉妹|兄弟|兄妹/.test(e.data.label);
        };

        // Group siblings by the "primary" node (usually source)
        // Map<SourceID, Set<SiblingID>>
        const siblingGroups = new Map<string, Set<string>>();
        const processedSiblingEdges = new Set<string>();

        rawInputEdges.forEach((e: any, idx: number) => {
            if (isSiblingEdge(e)) {
                // Collect siblings
                if (!siblingGroups.has(e.source)) {
                    siblingGroups.set(e.source, new Set([e.source]));
                }
                siblingGroups.get(e.source)!.add(e.target);
                processedSiblingEdges.add(e.id || idx.toString());
            }
        });

        // Create Implicit Parents for groups
        siblingGroups.forEach((siblings, sourceId) => {
            // Create a parent node
            const parentId = `implicit-parent-of-${sourceId}`;
            const parentIndex = additionalNodes.length;

            // Add Unknown Parent Node
            additionalNodes.push({
                id: parentId,
                type: 'person',
                position: { x: 0, y: 0 },
                data: {
                    person: {
                        id: parentId,
                        name: '親(不明)',
                        gender: 'U',
                        isDeceased: false,
                        isSelf: false,
                        isKeyPerson: false,
                        generation: -999, // Will be fixed by BFS
                        note: '自動生成された親ノード'
                    }
                }
            });

            // Create Marriage Node (fork point)
            const forkNodeId = `implicit-fork-${sourceId}`;
            additionalNodes.push({
                id: forkNodeId,
                type: 'marriage',
                position: { x: 0, y: 0 },
                data: { status: 'n/a' },
                draggable: false
            });

            // Edge: Parent -> Fork
            edges.push({
                id: `edge-implicit-${parentIndex}-root`,
                source: parentId,
                target: forkNodeId,
                type: 'straight',
                style: { stroke: '#333', strokeWidth: 2 }
            });

            // Edges: Fork -> Siblings
            Array.from(siblings).forEach((childId, i) => {
                edges.push({
                    id: `edge-implicit-${parentIndex}-child-${i}`,
                    source: forkNodeId,
                    target: childId,
                    type: 'smoothstep',
                    targetHandle: 'top',
                    sourceHandle: 'bottom-source',
                    style: { stroke: '#333', strokeWidth: 2 }
                });
            });
        });

        // Add remaining non-sibling edges
        rawInputEdges.forEach((e: any, idx: number) => {
            if (isSiblingEdge(e)) return;

            edges.push({
                id: e.id || `edge-${idx}`,
                source: e.source,
                target: e.target,
                type: e.type === 'marriage' ? 'straight' : 'smoothstep',
                style: { stroke: '#333', strokeWidth: 2 },
            });
        });

        // Combine nodes
        const allNodes = [...validNodes, ...additionalNodes];

        // --- 1. Dynamic Generation Inference via BFS (Updated) ---
        const nodeGenerations: { [id: string]: number } = {};
        const nodeIds = new Set(allNodes.map((n: any) => n.id));
        const finalEdges = edges; // Use our processed edges

        // 1. Identify "Roots"
        const hasParent = new Set<string>();
        finalEdges.forEach((e: any) => {
            // Marriage edges and implicit forks don't count as "parents" in the traditional sense 
            // BUT for generation calc, we need to trace flow.
            // Actually, Fork -> Child IS a parent relation.
            // Marriage Edge: Parent -> Fork (Straight)
            // Child Edge: Fork -> Child (Smoothstep)

            if (e.target && e.type !== 'marriage' && nodeIds.has(e.target)) {
                hasParent.add(e.target);
            }
        });

        const roots = allNodes.filter((n: any) => !hasParent.has(n.id));

        // 2. BFS to assign generations
        const queue: { id: string, gen: number }[] = roots.map((n: any) => ({ id: n.id, gen: 0 }));
        const visited = new Set<string>(roots.map((n: any) => n.id));

        // Initialize roots
        roots.forEach((n: any) => { nodeGenerations[n.id] = 0; });

        while (queue.length > 0) {
            const { id, gen } = queue.shift()!;
            nodeGenerations[id] = gen;

            // Find outgoing edges
            finalEdges.forEach((e: any) => {
                if (e.source === id && e.target && nodeIds.has(e.target)) {
                    // Logic: Marriage/Straight = Same Gen (usually partner or parent->fork?), 
                    // Actually Parent->Fork is "Straight" but should preserve generation? No, Parent is Gen X. Fork is Gen X.
                    // Fork->Child is Smoothstep. 

                    // Let's refine:
                    // If straight (marriage/fork-link): Same Gen
                    // If smoothstep (child-link): Next Gen

                    const isSameGen = e.type === 'straight' || e.type === 'marriage';
                    const nextGen = isSameGen ? gen : gen + 1;

                    if (!visited.has(e.target)) {
                        visited.add(e.target);
                        queue.push({ id: e.target, gen: nextGen });
                    }
                }
                // Handle Undirected Marriage Edges
                else if (e.type === 'straight' && e.target === id && e.source && nodeIds.has(e.source)) {
                    const partnerId = e.source;
                    if (!visited.has(partnerId)) {
                        visited.add(partnerId);
                        queue.push({ id: partnerId, gen: gen });
                    }
                }
            });
        }

        // Layout Helper: Group by generation
        const nodesByGen: { [gen: number]: number } = {};

        // Normalize Nodes
        const nodes: Node[] = allNodes.map((n: any, idx: number) => {
            const pData = n.data?.person || n.data || {};

            // PRIORITY: 1. BFS computed gen, 2. AI provided gen, 3. Default 0
            let gen = nodeGenerations[n.id];
            if (gen === undefined) gen = typeof pData.generation === 'number' ? pData.generation : 0;

            const genCount = nodesByGen[gen] || 0;
            nodesByGen[gen] = genCount + 1;

            const fallbackX = 100 + (genCount * 220);
            const fallbackY = 100 + (gen * 180);

            const hasValidPos = n.position && (n.position.x !== 0 || n.position.y !== 0);
            const position = hasValidPos ? n.position : { x: fallbackX, y: fallbackY };

            return {
                id: n.id || `node-${idx}`,
                type: n.type || 'person',
                position: position,
                draggable: n.draggable !== false,
                data: n.type === 'marriage' ? { status: n.data.status } : {
                    person: {
                        id: n.id || `node-${idx}`,
                        name: pData.name || pData.label || '不明',
                        gender: (pData.gender === 'male' || pData.gender === 'M') ? 'M'
                            : (pData.gender === 'female' || pData.gender === 'F') ? 'F'
                                : 'U',
                        isDeceased: pData.deceased || pData.isDeceased || false,
                        isSelf: pData.isSelf || (pData.label === '本人'),
                        isKeyPerson: !!pData.isKeyPerson,
                        generation: gen,
                        note: pData.note
                    }
                },
            };
        });

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

export const sanitizeGenogramData = (data: any): { nodes: Node[], edges: Edge[] } => {
    console.log('Sanitizing Genogram Data...');

    if (!data || typeof data !== 'object') {
        console.warn('Invalid data format: not an object');
        return { nodes: [], edges: [] };
    }

    const validNodes: Node[] = [];
    const nodeIds = new Set<string>();

    const inputNodes = Array.isArray(data.nodes) ? data.nodes : [];

    inputNodes.forEach((node: any, idx: number) => {
        // 1. Basic Node Validation
        if (!node || typeof node !== 'object') return;

        // Ensure ID
        const id = node.id || `node-safe-${idx}`;

        // 2. Data/Person Validation
        // If it's a 'person' type, it MUST have data.person
        if (node.type === 'person') {
            let personData = node.data?.person;

            // FIX: If data.person is missing but we have flat data (AI Output), normalize it
            if (!personData && node.data) {
                personData = {
                    id: node.id || id,
                    name: node.data.label || node.data.name || '不明',
                    gender: node.data.gender || 'U',
                    isDeceased: node.data.deceased || node.data.isDeceased || false,
                    isSelf: node.data.isSelf || (node.data.label === '本人'),
                    isKeyPerson: node.data.isKeyPerson || false,
                    generation: node.data.generation,
                    note: node.data.note
                };
            }

            if (!personData) {
                console.warn(`Node ${id} dropped: Missing person data`, node);
                return;
            }

            // Validate Person fields
            const p = personData;

            // Ensure optional fields are safe
            const safePerson = {
                ...p,
                id: p.id || id,
                name: p.name || '不明',
                // CRITICAL: Ensure gender is valid (M, F, U)
                gender: (p.gender === 'male' || p.gender === 'M') ? 'M'
                    : (p.gender === 'female' || p.gender === 'F') ? 'F'
                        : 'U',
                isDeceased: !!p.isDeceased,
                isSelf: !!p.isSelf,
                isKeyPerson: !!p.isKeyPerson,
                generation: typeof p.generation === 'number' ? p.generation : 0,
            };

            validNodes.push({
                ...node,
                id: id,
                // Reset type to ensure it's 'person' (some AI output might miss it)
                type: 'person',
                data: { ...node.data, person: safePerson },
                // Ensure position is safe
                position: node.position || { x: 0, y: 0 }
            });
        }
        // Marriage/Household nodes - simpler validation
        else if (node.type === 'marriage' || node.type === 'household') {
            validNodes.push({
                ...node,
                id: id,
                position: node.position || { x: 0, y: 0 }
            });
        }
        // Unknown types - pass through but ensure ID/Position
        else {
            validNodes.push({
                ...node,
                id: id,
                position: node.position || { x: 0, y: 0 }
            });
        }

        nodeIds.add(id);
    });

    // 3. Edge Validation
    const inputEdges = Array.isArray(data.edges) ? data.edges : [];
    const validEdges: Edge[] = [];

    inputEdges.forEach((edge: any, idx: number) => {
        if (!edge || typeof edge !== 'object') return;

        // Ensure Source/Target exist in validNodes
        if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
            validEdges.push({
                ...edge,
                id: edge.id || `edge-safe-${idx}`
            });
        } else {
            console.warn(`Edge dropped: Source(${edge.source}) or Target(${edge.target}) missing`);
        }
    });

    console.log(`Sanitization Complete. Valid Nodes: ${validNodes.length}, Valid Edges: ${validEdges.length}`);
    return { nodes: validNodes, edges: validEdges };
};
