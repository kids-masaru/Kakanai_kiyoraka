'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { PersonNodeData } from '@/lib/types';

const PersonNode = ({ data, selected }: NodeProps<PersonNodeData>) => {
    const { person } = data;
    const { gender, name, birthYear, isDeceased, isSelf, isKeyPerson, note } = person;

    // サイズ（統一して計算を楽に）
    const size = 30;

    // 形状（男性=四角、女性=丸、不明=ひし形）
    const getBorderRadius = () => {
        if (gender === 'M') return '2px';
        if (gender === 'F') return '50%';
        return '2px';
    };

    // 背景色
    const getBackground = () => {
        if (isDeceased) return '#d1d5db';
        return 'white';
    };

    // 枠線
    const getBorder = () => {
        if (isSelf) return '3px solid #2563eb';
        return '2px solid #374151';
    };

    // ひし形の回転
    const getTransform = () => {
        if (gender === 'U') return 'rotate(45deg)';
        return 'none';
    };

    return (
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {/* 上のハンドル（親からの接続受入） */}
            <Handle
                type="target"
                position={Position.Top}
                id="top"
                style={{ width: 8, height: 8, background: '#6b7280' }}
            />

            {/* メインノード */}
            <div
                style={{
                    width: size,
                    height: size,
                    borderRadius: getBorderRadius(),
                    border: getBorder(),
                    background: getBackground(),
                    transform: getTransform(),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: selected ? '0 0 0 2px #60a5fa' : 'none',
                    position: 'relative',
                    overflow: 'hidden', // SVGがはみ出ないように
                }}
            >
                {/* 死亡マーク (SVGで枠いっぱいにバッテン) */}
                {isDeceased && (
                    <svg
                        width="100%"
                        height="100%"
                        viewBox="0 0 24 24"
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            pointerEvents: 'none',
                            transform: gender === 'U' ? 'rotate(-45deg)' : 'none',
                        }}
                    >
                        <line x1="0" y1="0" x2="24" y2="24" stroke="#4b5563" strokeWidth="2" />
                        <line x1="24" y1="0" x2="0" y2="24" stroke="#4b5563" strokeWidth="2" />
                    </svg>
                )}
            </div>

            {/* ラベル */}
            <div style={{
                marginTop: 4,
                textAlign: 'center',
                transform: gender === 'U' ? 'none' : 'none',
            }}>
                <div style={{
                    fontSize: '11px',
                    fontWeight: 500,
                    color: '#1f2937',
                    whiteSpace: 'nowrap'
                }}>
                    {name}
                </div>
                {birthYear && (
                    <div style={{ fontSize: '10px', color: '#6b7280' }}>({birthYear})</div>
                )}
                {note && (
                    <div style={{ fontSize: '9px', color: '#9ca3af', maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        [{note}]
                    </div>
                )}
            </div>

            {/* 下のハンドル（子への接続元） */}
            <Handle
                type="source"
                position={Position.Bottom}
                id="bottom"
                style={{ width: 8, height: 8, background: '#6b7280' }}
            />

            {/* 左のハンドル（配偶者接続用 - source/target両方） */}
            <Handle
                type="source"
                position={Position.Left}
                id="left-source"
                style={{ top: 12, width: 6, height: 6, background: '#6b7280' }}
            />
            <Handle
                type="target"
                position={Position.Left}
                id="left-target"
                style={{ top: 12, width: 6, height: 6, background: '#6b7280' }}
            />

            {/* 右のハンドル（配偶者接続用 - source/target両方） */}
            <Handle
                type="source"
                position={Position.Right}
                id="right-source"
                style={{ top: 12, width: 6, height: 6, background: '#6b7280' }}
            />
            <Handle
                type="target"
                position={Position.Right}
                id="right-target"
                style={{ top: 12, width: 6, height: 6, background: '#6b7280' }}
            />
        </div>
    );
};

export default memo(PersonNode);
