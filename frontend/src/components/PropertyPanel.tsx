'use client';

import { useState, useEffect } from 'react';
import { Person } from '@/lib/types';

interface PropertyPanelProps {
    person: Person | null;
    onUpdate: (person: Person) => void;
    onDelete: (id: string) => void;
    onClose: () => void;
}

export default function PropertyPanel({
    person,
    onUpdate,
    onDelete,
    onClose,
}: PropertyPanelProps) {
    const [editedPerson, setEditedPerson] = useState<Person | null>(null);

    useEffect(() => {
        setEditedPerson(person);
    }, [person]);

    if (!editedPerson) return null;

    const handleChange = (field: keyof Person, value: any) => {
        setEditedPerson({ ...editedPerson, [field]: value });
    };

    const handleSave = () => {
        if (editedPerson) {
            onUpdate(editedPerson);
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
                <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: '#333' }}>プロパティ編集</h3>
                <button
                    onClick={onClose}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#999' }}
                >
                    ×
                </button>
            </div>

            <div className="space-y-3">
                <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '2px' }}>名前</label>
                    <input
                        type="text"
                        value={editedPerson.name}
                        onChange={(e) => handleChange('name', e.target.value)}
                        style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px' }}
                    />
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '2px' }}>性別</label>
                    <select
                        value={editedPerson.gender}
                        onChange={(e) => handleChange('gender', e.target.value)}
                        style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px' }}
                    >
                        <option value="M">男性</option>
                        <option value="F">女性</option>
                        <option value="U">不明</option>
                    </select>
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '2px' }}>生年</label>
                    <input
                        type="number"
                        value={editedPerson.birthYear || ''}
                        onChange={(e) => handleChange('birthYear', e.target.value ? parseInt(e.target.value) : undefined)}
                        style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px' }}
                        placeholder="例: 1960"
                    />
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '2px' }}>備考</label>
                    <input
                        type="text"
                        value={editedPerson.note || ''}
                        onChange={(e) => handleChange('note', e.target.value)}
                        style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px' }}
                        placeholder="認知症、要介護など"
                    />
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={editedPerson.isDeceased}
                            onChange={(e) => handleChange('isDeceased', e.target.checked)}
                        />
                        死亡
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={editedPerson.isSelf}
                            onChange={(e) => handleChange('isSelf', e.target.checked)}
                        />
                        本人
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={editedPerson.isKeyPerson}
                            onChange={(e) => handleChange('isKeyPerson', e.target.checked)}
                        />
                        キーパーソン
                    </label>
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
                    onClick={() => onDelete(editedPerson.id)}
                    style={{ flex: 1, padding: '8px', background: '#fee2e2', color: '#b91c1c', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}
                >
                    削除
                </button>
            </div>
        </div>
    );
}
