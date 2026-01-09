// 型定義
export type Gender = 'M' | 'F' | 'U';
export type RelationType = 'marriage' | 'divorce' | 'parent-child';

export interface Person {
    id: string;
    name: string;
    gender: Gender;
    birthYear?: number;
    deathYear?: number;
    isDeceased: boolean;
    isSelf: boolean;
    isKeyPerson: boolean;
    note?: string;
    generation: number;
}

export interface Marriage {
    id: string;
    husband: string;
    wife: string;
    status: 'married' | 'divorced' | 'separated' | 'cohabitation';
    children: string[];
}

export interface GenogramData {
    members: Person[];
    marriages: Marriage[];
}

// React Flow用の型
export interface PersonNodeData {
    person: Person;
}

export interface MarriageNodeData {
    status: 'married' | 'divorced' | 'separated' | 'cohabitation';
}
