'use client';

import React, { ReactNode, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useDnd } from './DndContext';
import { CopyItem } from '@/types';

interface DroppableProps {
    slotType: 'headline' | 'primary_text';
    onDrop: (item: CopyItem) => void;
    children: ReactNode;
    className?: string;
    isEmpty?: boolean;
}

export function Droppable({ onDrop, children, className = '', isEmpty = true }: DroppableProps) {
    const { dragState, endDrag } = useDnd();
    const [isOver, setIsOver] = useState(false);

    // Allow any copy item to be dropped in any slot (interchangeable)
    // The slot type is just a hint for the user
    const canAccept = dragState.isDragging && dragState.draggedItem !== null;

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        if (canAccept) {
            setIsOver(true);
        }
    }, [canAccept]);

    const handleDragLeave = useCallback(() => {
        setIsOver(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsOver(false);
        if (dragState.draggedItem && canAccept) {
            onDrop(dragState.draggedItem);
            endDrag();
        }
    }, [dragState.draggedItem, canAccept, onDrop, endDrag]);

    // Handle pointer events for Framer Motion drag
    const handlePointerEnter = useCallback(() => {
        if (canAccept) {
            setIsOver(true);
        }
    }, [canAccept]);

    const handlePointerLeave = useCallback(() => {
        setIsOver(false);
    }, []);

    const handlePointerUp = useCallback(() => {
        if (dragState.draggedItem && canAccept && isOver) {
            onDrop(dragState.draggedItem);
        }
        setIsOver(false);
    }, [dragState.draggedItem, canAccept, isOver, onDrop]);

    return (
        <motion.div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onPointerEnter={handlePointerEnter}
            onPointerLeave={handlePointerLeave}
            onPointerUp={handlePointerUp}
            animate={{
                scale: isOver && canAccept ? 1.02 : 1,
                borderColor: isOver && canAccept
                    ? 'var(--accent-primary)'
                    : isEmpty
                        ? 'var(--border)'
                        : 'rgba(0, 0, 0, 0)',
                backgroundColor: isOver && canAccept
                    ? 'var(--drop-zone-hover)'
                    : isEmpty
                        ? 'var(--drop-zone-empty)'
                        : 'rgba(0, 0, 0, 0)',
            }}
            transition={{ duration: 0.15 }}
            className={`
        rounded-lg border-2 border-dashed transition-shadow
        ${canAccept ? 'ring-2 ring-accent-primary/20' : ''}
        ${className}
      `}
        >
            {children}
        </motion.div>
    );
}
