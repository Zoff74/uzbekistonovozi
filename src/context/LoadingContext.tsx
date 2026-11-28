"use client";
//src\context\LoadingContext.tsx
import React, { useState, createContext, useContext, useCallback, useMemo, ReactNode } from 'react';
import { usePlayer } from '@/context/PlayerContext';

interface LoadingContextType {
    isLoading: boolean;
    startLoading: () => void;
    stopLoading: () => void;
}

const LoadingContext = createContext<LoadingContextType>({
    isLoading: false,
    startLoading: () => {},
    stopLoading: () => {},
});

export const useLoading = () => useContext(LoadingContext);

function useSafeIsVideoActive(): boolean {
    try {
        const player = usePlayer();
        return Boolean(player.isVideoPlaying || player.isVideoMode);
    } catch {
        return false;
    }
}

export const LoadingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [loadingCounter, setLoadingCounter] = useState(0);
    const isVideoActive = useSafeIsVideoActive();

    const startLoading = useCallback(() => {
        setLoadingCounter(prev => prev + 1);
    }, []);

    const stopLoading = useCallback(() => {
        setLoadingCounter(prev => Math.max(0, prev - 1));
    }, []);

    const value = useMemo(() => ({
        isLoading: !isVideoActive && loadingCounter > 0,
        startLoading,
        stopLoading,
    }), [isVideoActive, loadingCounter, startLoading, stopLoading]);

    return (
        <LoadingContext.Provider value={value}>
            {children}
        </LoadingContext.Provider>
    );
};