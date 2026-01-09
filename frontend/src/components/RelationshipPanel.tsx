'use client';

import { useState, useEffect } from 'react';
import { Marriage } from '@/lib/types';

interface RelationshipPanelProps {
    marriage: Marriage | null;
    onUpdate: (marriage: Marriage) => void;
    onDelete: (id: string) => void;
    onClose: () => void;
}

export default function RelationshipPanel({
    marriage,
    onUpdate,
    onDelete,
    onClose,
}: RelationshipPanelProps) {
    const [editedMarriage, setEditedMarriage] = useState<Marriage | null>(null);

    useEffect(() => {
        setEditedMarriage(marriage);
    }, [marriage]);

    if (!editedMarriage) return null;

    const handleChange = (field: keyof Marriage, value: any) => {
        setEditedMarriage({ ...editedMarriage, [field]: value });
    };

    const handleSave = () => {
        if (editedMarriage) {
            onUpdate(editedMarriage);
        }
    };

    return (
        <div style={{
            background: 'white',
            padding: '12px',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            width: '280px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
        }}>
            <div className="flex justify-between items-center" style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: '8px', marginBottom: '4px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: '#333' }}>関係プロパティ</h3>
                <button
                    onClick={onClose}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#999' }}
                >
                    ×
                </button>
            </div>

            <div className="space-y-3">
                <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '2px' }}>状態</label>
                    <select
                        value={editedMarriage.status}
                        onChange={(e) => handleChange('status', e.target.value)}
                        style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px' }}
                    >
                        <option value="married">婚姻 (Married)</option>
                        <option value="divorced">離婚 (Divorced)</option>
                        <option value="separated">別居 (Separated)</option>
                        <option value="cohabitation">事実婚・同棲 (Cohabitation)</option>
                    </select>
                </div>

                <div style={{ background: '#f9fafb', padding: '8px', borderRadius: '4px', fontSize: '11px', color: '#666' }}>
                    <p>※ 関係の種類によって線や記号が変化します。</p>
                    <ul style={{ listStyleType: 'disc', paddingLeft: '16px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <li>婚姻: 実線</li>
                        <li>離婚: 実線 + //</li>
                        <li>別居: 実線 + /</li>
                        <li>事実婚: 点線</li>
                    </ul>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
                <button
                    onClick={handleSave}
                    style={{ flex: 2, padding: '8px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}
                >
                    保存
                </button>
                <button
                    onClick={() => onDelete(editedMarriage.id)}
                    style={{ flex: 1, padding: '8px', background: '#fee2e2', color: '#b91c1c', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}
                >
                    削除
                </button>
            </div>
        </div>
    );
}
