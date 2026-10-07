"use client";

import React, { useState, createContext, useContext, useCallback, useMemo, ReactNode } from 'react';

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

export const LoadingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [loadingCounter, setLoadingCounter] = useState(0);

    const startLoading = useCallback(() => {
        setLoadingCounter(prev => prev + 1);
    }, []);

    const stopLoading = useCallback(() => {
        setLoadingCounter(prev => Math.max(0, prev - 1));
    }, []);
    
    const value = useMemo(() => ({
        isLoading: loadingCounter > 0,
        startLoading,
        stopLoading,
    }), [loadingCounter, startLoading, stopLoading]);

    return (
        <LoadingContext.Provider value={value}>
            {children}
        </LoadingContext.Provider>
    );
};