export type Point = {
    x: number;
    y: number;
};

export type RoomType = 'Living' | 'Kitchen' | 'Bedroom' | 'Bathroom' | 'Toilet' | 'Entrance' | 'Corridor' | 'Other' | 'Dining' | 'LivingTatami' | 'LivingFlooring';

export type Room = {
    id: string;
    name: string;
    type: RoomType;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
};

export type Wall = {
    id: string;
    start: Point;
    end: Point;
    thickness: number;
};

export type FurnitureType = 'Bed' | 'Wheelchair' | 'Table' | 'Toilet' | 'Bath' | 'Door' | 'Window' | 'Stairs' | 'Handrail' | 'Step' | 'StepLocation' | 'Washroom' | 'SlidingDoor' | 'Futon' | 'HandrailDot';

export type Furniture = {
    id: string;
    type: FurnitureType;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    label?: string;
};

export type KaokuzuData = {
    rooms: Room[];
    walls: Wall[];
    furniture: Furniture[];
    scale: number; // pixels per meter
};
