'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CopyItem } from '@/types';

interface DragState {
    isDragging: boolean;
    draggedItem: CopyItem | null;
    applyToAll: boolean;
    // Position for drag layer
    position: { x: number; y: number };
}

interface DndContextValue {
    dragState: DragState;
    startDrag: (item: CopyItem) => void;
    updateDragPosition: (x: number, y: number) => void;
    endDrag: () => void;
    setApplyToAll: (value: boolean) => void;
}

const DndContext = createContext<DndContextValue | null>(null);

export function useDnd() {
    const context = useContext(DndContext);
    if (!context) {
        throw new Error('useDnd must be used within a DndProvider');
    }
    return context;
}

interface DndProviderProps {
    children: ReactNode;
}

export function DndProvider({ children }: DndProviderProps) {
    const [dragState, setDragState] = useState<DragState>({
        isDragging: false,
        draggedItem: null,
        applyToAll: false,
        position: { x: 0, y: 0 },
    });

    const startDrag = useCallback((item: CopyItem) => {
        setDragState(prev => ({
            ...prev,
            isDragging: true,
            draggedItem: item,
        }));
    }, []);

    const updateDragPosition = useCallback((x: number, y: number) => {
        setDragState(prev => ({
            ...prev,
            position: { x, y },
        }));
    }, []);

    const endDrag = useCallback(() => {
        setDragState(prev => ({
            ...prev,
            isDragging: false,
            draggedItem: null,
        }));
    }, []);

    const setApplyToAll = useCallback((value: boolean) => {
        setDragState(prev => ({
            ...prev,
            applyToAll: value,
        }));
    }, []);

    return (
        <DndContext.Provider value={{ dragState, startDrag, updateDragPosition, endDrag, setApplyToAll }}>
            {children}
        </DndContext.Provider>
    );
}
