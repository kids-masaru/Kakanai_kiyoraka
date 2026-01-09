'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { MarriageNodeData } from '@/lib/types';

const MarriageNode = ({ data, selected }: NodeProps<MarriageNodeData>) => {
    const { status } = data;

    return (
        <div style={{
            position: 'relative',
            width: 30, // 全体のクリックエリアを大きく
            height: 30,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none', // 親はイベント透過、子要素で制御
        }}>
            {/* 実際の表示ドットとクリック判定 */}
            <div style={{
                width: 8,
                height: 8,
                background: 'transparent', // 透明にして見えなくする
                border: 'none', // 枠線も消す
                borderRadius: '50%',
                cursor: 'pointer',
                pointerEvents: 'auto', // クリックは受け付ける
                boxShadow: selected ? '0 0 0 4px rgba(96, 165, 250, 0.5)' : 'none', // 選択時のみハイライト
                zIndex: 20,
                position: 'relative',
            }} />

            {/* 左のハンドル（完全に中心） */}
            <Handle
                type="target"
                position={Position.Left}
                id="left-target"
                style={{ width: 1, height: 1, background: 'transparent', border: 'none', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
            />
            <Handle
                type="source"
                position={Position.Left}
                id="left-source"
                style={{ width: 1, height: 1, background: 'transparent', border: 'none', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
            />

            {/* ステータス記号（SVGで描画） */}
            {(status === 'divorced' || status === 'separated') && (
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: 40,
                    height: 40,
                    pointerEvents: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10,
                }}>
                    <svg width="40" height="40" viewBox="0 0 40 40">
                        {status === 'divorced' && (
                            <>
                                <line x1="12" y1="8" x2="12" y2="32" stroke="black" strokeWidth="2" transform="rotate(15 12 20)" />
                                <line x1="28" y1="8" x2="28" y2="32" stroke="black" strokeWidth="2" transform="rotate(15 28 20)" />
                            </>
                        )}
                        {status === 'separated' && (
                            <line x1="20" y1="8" x2="20" y2="32" stroke="black" strokeWidth="2" transform="rotate(15 20 20)" />
                        )}
                    </svg>
                </div>
            )}

            {/* 右のハンドル（完全に中心） */}
            <Handle
                type="source"
                position={Position.Right}
                id="right-source"
                style={{ width: 1, height: 1, background: 'transparent', border: 'none', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
            />
            <Handle
                type="target"
                position={Position.Right}
                id="right-target"
                style={{ width: 1, height: 1, background: 'transparent', border: 'none', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
            />

            {/* 下のハンドル（子への接続） */}
            <Handle
                type="source"
                position={Position.Bottom}
                id="bottom-source"
                style={{ width: 1, height: 1, background: 'transparent', border: 'none', bottom: 7, left: 15 }}
            />
        </div>
    );
};

export default memo(MarriageNode);
