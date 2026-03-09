import { createContext, useContext } from 'react';
import { App, Plugin } from 'obsidian';
import { AsyncResearchApi } from '../api';

interface AppContextType {
    app: App;
    plugin: Plugin;
    api: AsyncResearchApi;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{
    children: React.ReactNode;
    app: App;
    plugin: Plugin;
    api: AsyncResearchApi;
}> = ({ children, app, plugin, api }) => {
    return (
        <AppContext.Provider value={{ app, plugin, api }}>
            {children}
        </AppContext.Provider>
    );
};

export const useApp = (): AppContextType => {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error('useApp must be used within an AppProvider');
    }
    return context;
};
