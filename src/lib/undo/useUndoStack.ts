'use client';

import { useState, useCallback } from 'react';

interface UndoState<T> {
    past: T[];
    present: T;
    future: T[];
    // Descriptions move in lockstep with past/future. They live in the same
    // state object so updates stay atomic and the updater functions stay pure
    // (mutating refs inside updaters double-fires in StrictMode).
    pastDescriptions: string[];
    futureDescriptions: string[];
}

interface UseUndoStackReturn<T> {
    state: T;
    setState: (newState: T, actionDescription?: string) => void;
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
    undoDescription: string | undefined;
    redoDescription: string | undefined;
}

const MAX_HISTORY = 50;

export function useUndoStack<T>(initialState: T): UseUndoStackReturn<T> {
    const [undoState, setUndoState] = useState<UndoState<T>>({
        past: [],
        present: initialState,
        future: [],
        pastDescriptions: [],
        futureDescriptions: [],
    });

    const setState = useCallback((newState: T, actionDescription: string = 'Change') => {
        setUndoState((prev) => ({
            past: [...prev.past, prev.present].slice(-MAX_HISTORY),
            present: newState,
            future: [],
            pastDescriptions: [...prev.pastDescriptions, actionDescription].slice(-MAX_HISTORY),
            futureDescriptions: [],
        }));
    }, []);

    const undo = useCallback(() => {
        setUndoState((prev) => {
            if (prev.past.length === 0) return prev;

            const lastDescription = prev.pastDescriptions[prev.pastDescriptions.length - 1] || 'Undo';

            return {
                past: prev.past.slice(0, -1),
                present: prev.past[prev.past.length - 1],
                future: [prev.present, ...prev.future],
                pastDescriptions: prev.pastDescriptions.slice(0, -1),
                futureDescriptions: [lastDescription, ...prev.futureDescriptions],
            };
        });
    }, []);

    const redo = useCallback(() => {
        setUndoState((prev) => {
            if (prev.future.length === 0) return prev;

            const nextDescription = prev.futureDescriptions[0] || 'Redo';

            return {
                past: [...prev.past, prev.present],
                present: prev.future[0],
                future: prev.future.slice(1),
                pastDescriptions: [...prev.pastDescriptions, nextDescription],
                futureDescriptions: prev.futureDescriptions.slice(1),
            };
        });
    }, []);

    return {
        state: undoState.present,
        setState,
        undo,
        redo,
        canUndo: undoState.past.length > 0,
        canRedo: undoState.future.length > 0,
        undoDescription: undoState.pastDescriptions[undoState.pastDescriptions.length - 1],
        redoDescription: undoState.futureDescriptions[0],
    };
}
