import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { Frame, UserContext, GenerationStatus } from '../api';

export enum ViewMode {
    LOGIN = 'login',
    SETUP = 'setup',
    FRAMES = 'frames',
    EXPERIMENT_BATCH = 'experiment_batch'
}

export interface FrameStore {
    // Authentication state
    isAuthenticated: boolean;
    authToken: string | null;
    username: string | null;
    
    // View state
    currentView: ViewMode;
    
    // User context data
    userContext: UserContext | null;
    
    // Frames data
    frames: Frame[];
    totalFrameCount: number;
    newFrameCount: number;
    
    // Generation status
    generationStatus: GenerationStatus | null;
    
    // UI state
    isLoading: boolean;
    error: string | null;
    
    // Pagination
    currentPage: number;
    framesPerPage: number;
    
    // Authentication actions
    setAuthenticated: (token: string, username: string) => void;
    logout: () => void;
    
    // Actions for view management
    setCurrentView: (view: ViewMode) => void;
    
    // Context actions
    setUserContext: (context: UserContext) => void;
    
    // Frame actions
    setFrames: (frames: Frame[], totalCount: number, newCount: number) => void;
    addFrames: (frames: Frame[]) => void;
    markFrameViewed: (frameId: number) => void;
    deleteFrame: (frameId: number) => void;
    
    // Frame refresh callback
    frameRefreshCallback: (() => Promise<void>) | null;
    setFrameRefreshCallback: (callback: (() => Promise<void>) | null) => void;
    
    // Generation status
    setGenerationStatus: (status: GenerationStatus | ((prev: GenerationStatus | null) => GenerationStatus)) => void;
    
    // UI actions
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;
    
    // Pagination actions
    setCurrentPage: (page: number) => void;
    setFramesPerPage: (count: number) => void;
    
    // Computed values
    hasUserContext: () => boolean;
    getDisplayFrames: () => Frame[];
    getTotalPages: () => number;
    hasNewFrames: () => boolean;
    
    // Reset function
    reset: () => void;
}

export const useFrameStore = create<FrameStore>()(
    subscribeWithSelector((set, get) => ({
        // Initial state
        isAuthenticated: false,
        authToken: null,
        username: null,
        currentView: ViewMode.LOGIN,
        userContext: null,
        frames: [],
        totalFrameCount: 0,
        newFrameCount: 0,
        generationStatus: null,
        isLoading: false,
        error: null,
        currentPage: 1,
        framesPerPage: 10,
        frameRefreshCallback: null,
        
        // Authentication actions
        setAuthenticated: (token: string, username: string) => set({ 
            isAuthenticated: true, 
            authToken: token, 
            username,
            currentView: ViewMode.SETUP 
        }),
        
        logout: () => {
            // Clear all state
            set({ 
                isAuthenticated: false, 
                authToken: null, 
                username: null,
                currentView: ViewMode.LOGIN,
                userContext: null,
                frames: [],
                totalFrameCount: 0,
                newFrameCount: 0,
                generationStatus: null,
                error: null
            });
            
            // Clear any stored tokens in localStorage/sessionStorage if present
            try {
                localStorage.removeItem('authToken');
                sessionStorage.removeItem('authToken');
            } catch (e) {
                console.warn('Could not clear storage:', e);
            }
        },
        
        // View actions
        setCurrentView: (view: ViewMode) => set({ currentView: view }),
        
        // Context actions
        setUserContext: (context: UserContext) => set({ userContext: context }),
        
        // Frame actions
        setFrames: (frames: Frame[], totalCount: number, newCount: number) => {
            console.log('🏪 Store setFrames called with:', {
                framesLength: frames.length,
                totalCount,
                newCount
            });
            
            set({ 
                frames, 
                totalFrameCount: totalCount, 
                newFrameCount: newCount
                // DON'T reset currentPage here - let pagination work!
            });
            
            const state = get();
            console.log('🏪 Store state after setFrames:', {
                framesLength: state.frames.length,
                totalFrameCount: state.totalFrameCount,
                newFrameCount: state.newFrameCount,
                currentPage: state.currentPage
            });
        },
        
        addFrames: (newFrames: Frame[]) => {
            set(state => ({
                frames: [...state.frames, ...newFrames],
                totalFrameCount: state.totalFrameCount + newFrames.length
            }));
        },
        
        markFrameViewed: (frameId: number) => {
            set(state => ({
                frames: state.frames.map(frame => 
                    frame.id === frameId 
                        ? { ...frame, is_viewed: true }
                        : frame
                ),
                newFrameCount: Math.max(0, state.newFrameCount - 1)
            }));
        },

        deleteFrame: (frameId: number) => {
            set(state => {
                const frameToDelete = state.frames.find(frame => frame.id === frameId);
                const newFrames = state.frames.filter(frame => frame.id !== frameId);
                
                return {
                    frames: newFrames,
                    totalFrameCount: Math.max(0, state.totalFrameCount - 1),
                    newFrameCount: frameToDelete && !frameToDelete.is_viewed 
                        ? Math.max(0, state.newFrameCount - 1) 
                        : state.newFrameCount
                };
            });
        },
        
        // Frame refresh callback
        setFrameRefreshCallback: (callback: (() => Promise<void>) | null) => {
            console.log('🔄 Setting frameRefreshCallback in store:', callback ? 'function provided' : 'null');
            set({ frameRefreshCallback: callback });
        },
        
        // Generation status
        setGenerationStatus: (status: GenerationStatus | ((prev: GenerationStatus | null) => GenerationStatus)) => {
            if (typeof status === 'function') {
                set(state => ({ generationStatus: status(state.generationStatus) }));
            } else {
                set({ generationStatus: status });
            }
        },
        
        // UI actions
        setLoading: (loading: boolean) => set({ isLoading: loading }),
        setError: (error: string | null) => set({ error }),
        
        // Pagination actions
        setCurrentPage: (page: number) => {
            const totalPages = get().getTotalPages();
            const validPage = Math.max(1, Math.min(page, totalPages));
            set({ currentPage: validPage });
        },
        
        setFramesPerPage: (count: number) => set({ 
            framesPerPage: count,
            currentPage: 1  // Reset to first page when page size changes
        }),
        
        // Computed values
        hasUserContext: () => {
            const context = get().userContext;
            return context !== null && 
                   context.research_interest.length > 0 && 
                   context.selected_note_ids && context.selected_note_ids.length > 0;
        },
        
        getDisplayFrames: () => {
            const { frames, currentPage, framesPerPage } = get();
            const startIndex = (currentPage - 1) * framesPerPage;
            const endIndex = startIndex + framesPerPage;
            return frames.slice(startIndex, endIndex);
        },
        
        getTotalPages: () => {
            const { totalFrameCount, framesPerPage } = get();
            return Math.ceil(totalFrameCount / framesPerPage);
        },
        
        hasNewFrames: () => {
            return get().newFrameCount > 0;
        },
        
        // Reset function
        reset: () => set({
            isAuthenticated: false,
            authToken: null,
            username: null,
            currentView: ViewMode.LOGIN,
            userContext: null,
            frames: [],
            totalFrameCount: 0,
            newFrameCount: 0,
            generationStatus: null,
            isLoading: false,
            error: null,
            currentPage: 1,
            framesPerPage: 50
        })
    }))
);