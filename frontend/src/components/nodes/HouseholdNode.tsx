import { memo } from 'react';
import { Handle, Position, NodeProps, NodeResizer } from 'reactflow';

const HouseholdNode = ({ data, selected }: NodeProps) => {
    return (
        <div style={{ width: '100%', height: '100%' }}>
            <NodeResizer
                minWidth={100}
                minHeight={100}
                isVisible={selected}
                lineStyle={{ border: '1px solid #666' }}
                handleStyle={{ width: 8, height: 8, borderRadius: '50%' }}
            />
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    border: '2px dashed #555',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'center',
                    padding: '4px'
                }}
            >
                <span style={{ fontSize: '10px', color: '#555', background: 'white', padding: '0 4px' }}>
                    {data.label || '世帯'}
                </span>
            </div>
        </div>
    );
};

export default memo(HouseholdNode);
