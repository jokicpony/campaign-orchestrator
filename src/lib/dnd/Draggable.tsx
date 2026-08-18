'use client';

import React, { ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { CopyItem } from '@/types';
import { useDnd } from './DndContext';

interface DraggableProps {
    item: CopyItem;
    children: ReactNode;
    className?: string;
}

export function Draggable({ item, children, className = '' }: DraggableProps) {
    const { startDrag, updateDragPosition, endDrag } = useDnd();
    const [isDraggingThis, setIsDraggingThis] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    // Captured at drag start so the portal doesn't read the ref during render
    const [dragWidth, setDragWidth] = useState<number | undefined>(undefined);
    const elementRef = useRef<HTMLDivElement>(null);
    // Set at drag start (event handler) — the portal only renders mid-drag
    const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

    // Handle mouse move while dragging
    useEffect(() => {
        if (!isDraggingThis) return;

        const handleMouseMove = (e: MouseEvent) => {
            setMousePos({ x: e.clientX, y: e.clientY });
            updateDragPosition(e.clientX, e.clientY);
        };

        const handleMouseUp = () => {
            setIsDraggingThis(false);
            endDrag();
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDraggingThis, endDrag, updateDragPosition]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!elementRef.current) return;

        const rect = elementRef.current.getBoundingClientRect();
        setDragOffset({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        });
        setMousePos({ x: e.clientX, y: e.clientY });
        setDragWidth(rect.width);
        setPortalContainer(document.body);
        setIsDraggingThis(true);
        startDrag(item);

        e.preventDefault();
    };

    return (
        <>
            <div
                ref={elementRef}
                onMouseDown={handleMouseDown}
                className={`cursor-grab active:cursor-grabbing select-none ${className} ${isDraggingThis ? 'opacity-50' : ''}`}
            >
                {children}
            </div>

            {/* Drag Layer Portal - renders at document level for proper z-index */}
            {isDraggingThis && portalContainer && createPortal(
                <motion.div
                    initial={{ scale: 1 }}
                    animate={{ scale: 1.05 }}
                    style={{
                        position: 'fixed',
                        left: mousePos.x - dragOffset.x,
                        top: mousePos.y - dragOffset.y,
                        pointerEvents: 'none',
                        zIndex: 99999,
                        width: dragWidth,
                    }}
                    className="shadow-2xl rounded-lg"
                >
                    {children}
                </motion.div>,
                portalContainer
            )}
        </>
    );
}
