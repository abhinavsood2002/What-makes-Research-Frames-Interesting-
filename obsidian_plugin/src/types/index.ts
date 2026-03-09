export interface FileData {
    path: string;
    content: string;
}

export interface PaperData {
    id: string;
    title: string;
    abstract: string;
    authors: string[];
    publication_date?: string;
    doi?: string;
    url?: string;
    search_term?: string;
}

export interface ChunkData {
    file_path: string;
    chunk_index: number;
    content: string;
    word_count: number;
}

export interface ValidationResult {
    isValid: boolean;
    message?: string;
}

export interface ComplexityAnalysis {
    score: number;
    isManageable: boolean;
    recommendations: string[];
}