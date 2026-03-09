// api.ts - Async API client for frame browsing

export interface ApiSettings {
    backendUrl: string;
    username: string;
    password: string;
    token: string;
}


export interface Frame {
    id: number;
    title: string;
    perspective: string;  // 150-200 word exploratory perspective
    research_question: string;  // The question this frame addresses
    created_at: string;
    generation_time_minutes: number;
    is_viewed: boolean;
    notes_used: number[];
    pdfs_used: number[];
    category?: string;  // 'useless', 'interesting'
    strategy_name?: string;  // Strategy used to generate this frame
}

export interface FrameListResponse {
    frames: Frame[];
    total_count: number;
    new_frames_count: number;
}

export interface UserContext {
    research_interest: string;
    selected_note_ids: number[];
    selected_pdf_ids: number[];
    updated_at: string | null;
}

export interface AuthenticationResponse {
    username: string;
    is_new_user: boolean;
    session_token: string;
}

export interface GenerationStatus {
    new_frames_available: number;
    background_worker_status: string;
    queue_status?: {
        pending: number;
        processing: number;
        pending_positions: number[];
        total_queue_length: number;
        estimated_wait_time: number; // in minutes
    };
}

export interface ProgressMessage {
    type: 'progress';
    step: string;
    message: string;
    timestamp: number;
    metadata?: Record<string, any>;
}


export interface FrameStrategy {
    name: string;
    display_name: string;
    default_params: Record<string, any>;
    required_params: string[];
}

export interface AvailableStrategiesResponse {
    strategies: Record<string, FrameStrategy>;
    default_strategy: string;
}



export interface UserPDF {
    id: number;
    filename: string;
    original_filename: string;
    file_size: number;
    upload_date: string;
    is_selected: boolean;
    source: string;
}

export interface PDFListResponse {
    pdfs: UserPDF[];
}

export interface VaultPDF {
    filename: string;
    file_path: string;
    file_size: number;
    modified_at: number;
    already_added?: boolean;
}

export interface PDFSelectionUpdate {
    pdf_selections: Record<number, boolean>;
}

// Frame Ranking Interfaces
export interface FrameCategorizationRequest {
    frame_categories: Record<number, string>; // frame_id -> category
}

export interface FrameRankingRequest {
    comparisons: Array<{winner: number, loser: number}>;
}

export interface RankingPairingsResponse {
    pairings: number[][];  // Array of [frame_id_1, frame_id_2] pairs
    total_comparisons: number;
}

export interface FrameRanking {
    frame_id: number;
    rank_position: number;
    wins?: number;
}

// Past ranking interfaces
export interface PastRankingResult {
    frame_id: number;
    rank_position: number;
    wins: number;
    frame: {
        id: number;
        title: string;
        perspective: string;
        research_question: string;
        created_at: string | null;
        generation_time_minutes: number;
        strategy_name: string;
        category: string;
    };
}

export interface RankingComparison {
    frame_1_id: number;
    frame_2_id: number;
    winner_frame_id: number;
    created_at: string | null;
    frame_1_title: string;
    frame_2_title: string;
    winner_title: string;
}

export interface PastRankingResponse {
    rankings: PastRankingResult[];
    comparisons: RankingComparison[];
    total_frames: number;
    total_comparisons: number;
    message: string;
}

interface RequestOptions {
    method?: string;
    body?: any;
    headers?: Record<string, string>;
}

export class AsyncResearchApi {
    settings: ApiSettings;
    private readonly REQUEST_TIMEOUT = 60000; // 30 seconds for regular requests
    private readonly LONG_REQUEST_TIMEOUT = 1200000; // 10 minutes for extraction operations
    private websocket: WebSocket | null = null;
    private websocketCallbacks: Map<string, (data: any) => void> = new Map();
    private onLogoutCallback: (() => void) | null = null;

    constructor(settings: ApiSettings) {
        this.settings = settings;
    }

    // Update auth token dynamically
    updateAuthToken(token: string) {
        this.settings.token = token;
    }

    // Set callback for when backend goes down (WebSocket disconnect)
    setOnLogout(callback: () => void) {
        this.onLogoutCallback = callback;
    }

    // WebSocket connection management
    connectWebSocket(): void {
        if (this.websocket?.readyState === WebSocket.OPEN) {
            console.log('🔌 WebSocket already connected, skipping');
            return; // Already connected
        }

        if (!this.settings.token || this.settings.token.length < 10) {
            console.warn('🚫 Cannot connect WebSocket without valid authentication token');
            return;
        }

        // Clean up any existing connection first
        if (this.websocket) {
            this.disconnectWebSocket();
        }

        const wsUrl = this.settings.backendUrl.replace('http', 'ws') + `/ws/${this.settings.token}`;
        console.log(`🔌 Connecting WebSocket to: ${wsUrl.replace(this.settings.token, '***')}`);
        console.log(`🔑 Frontend using session token: ${this.settings.token.substring(0, 8)}...`);
        
        try {
            this.websocket = new WebSocket(wsUrl);

            this.websocket.onopen = () => {
                console.log('✅ WebSocket connected successfully');
            };

            this.websocket.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleWebSocketMessage(message);
                } catch (error) {
                    console.error('❌ Error parsing WebSocket message:', error);
                }
            };

            this.websocket.onclose = (event) => {
                console.log(`❌ WebSocket disconnected: ${event.code} ${event.reason || 'No reason'}`);
                this.websocket = null;
                
                // Handle different disconnect scenarios
                if (event.code === 1008 || event.code === 1002) {
                    console.warn('🔐 WebSocket authentication failed - session invalid');
                    console.warn('🚫 Stopping reconnection attempts due to invalid session');
                    // Clear the token to prevent reconnection with invalid credentials
                    this.settings.token = '';
                    if (this.onLogoutCallback) {
                        this.onLogoutCallback();
                    }
                } else if (event.code !== 1000 && event.code !== 1001) { // Not normal closure
                    console.warn('🔄 WebSocket disconnected unexpectedly - not reconnecting automatically');
                    // Don't auto-reconnect to prevent spam with invalid tokens
                }
            };

            this.websocket.onerror = (error) => {
                console.error('❌ WebSocket connection error:', error);
            };

        } catch (error) {
            console.error('❌ Error creating WebSocket connection:', error);
        }
    }

    disconnectWebSocket(): void {
        if (this.websocket) {
            console.log('🔌 Disconnecting WebSocket');
            this.websocket.close(1000, 'Disconnecting');
            this.websocket = null;
        }
        // Clear callbacks when disconnecting
        this.websocketCallbacks.clear();
    }

    private handleWebSocketMessage(message: any): void {
        if (message.type === 'queue_update' || message.type === 'progress') {
            // Notify registered callbacks
            this.websocketCallbacks.forEach((callback) => {
                callback(message);
            });
        }
    }

    // Register callback for WebSocket queue updates
    onQueueUpdate(callback: (data: any) => void): string {
        const callbackId = Math.random().toString(36);
        this.websocketCallbacks.set(callbackId, callback);
        return callbackId;
    }

    // Unregister callback
    offQueueUpdate(callbackId?: string): void {
        if (callbackId) {
            this.websocketCallbacks.delete(callbackId);
        } else {
            this.websocketCallbacks.clear();
        }
    }

    private async _authenticatedRequest<T>(
        endpoint: string, 
        options: RequestOptions = {},
        customTimeout?: number
    ): Promise<T> {
        if (!this.settings.token) {
            throw new Error('Please authenticate first');
        }

        const timeout = customTimeout || this.REQUEST_TIMEOUT;
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => {
            abortController.abort();
        }, timeout);

        const requestHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.settings.token}`,
            ...options.headers || {}
        };

        const requestOptions: RequestInit = {
            method: options.method || 'GET',
            headers: requestHeaders,
            signal: abortController.signal
        };

        if (options.body) {
            requestOptions.body = JSON.stringify(options.body);
        }

        try {
            const response = await fetch(`${this.settings.backendUrl}${endpoint}`, requestOptions);
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('Authentication expired. Please authenticate again.');
                }
                
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`Error ${response.status}: ${errorData.detail || response.statusText}`);
            }
            
            const result = await response.json();
            return result;
            
        } catch (error) {
            clearTimeout(timeoutId);
            
            if (error.name === 'AbortError') {
                throw new Error(`Request timeout: ${endpoint} took longer than ${timeout / 1000} seconds`);
            }
            
            throw error;
        }
    }

    // Authentication - Login existing user
    async login(): Promise<AuthenticationResponse> {
        if (!this.settings.username || !this.settings.password) {
            throw new Error('Please set both username and password in the plugin settings');
        }
        
        const response = await fetch(`${this.settings.backendUrl}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: this.settings.username,
                password: this.settings.password
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            if (response.status === 401) {
                throw new Error('Invalid username or password. Use signup for new accounts.');
            }
            throw new Error(`Error ${response.status}: ${errorData.detail || response.statusText}`);
        }
        
        const data: AuthenticationResponse = await response.json();
        console.log(`🔑 Login successful - Received session_token: ${data.session_token.substring(0, 8)}...`);
        return data;
    }

    // Authentication - Create new user account
    async signup(): Promise<AuthenticationResponse> {
        if (!this.settings.username || !this.settings.password) {
            throw new Error('Please set both username and password in the plugin settings');
        }
        
        const response = await fetch(`${this.settings.backendUrl}/signup`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: this.settings.username,
                password: this.settings.password
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            if (response.status === 409) {
                throw new Error('Username already exists. Use login instead.');
            }
            throw new Error(`Error ${response.status}: ${errorData.detail || response.statusText}`);
        }
        
        const data: AuthenticationResponse = await response.json();
        console.log(`🆕 Signup successful - Received session_token: ${data.session_token.substring(0, 8)}...`);
        return data;
    }

    // Legacy authentication method - tries login first, then suggests signup
    async authenticate(): Promise<AuthenticationResponse> {
        try {
            return await this.login();
        } catch (error) {
            if (error.message.includes('Invalid username or password')) {
                throw new Error('Login failed. If this is a new account, use signup first.');
            }
            throw error;
        }
    }

    // Update user research context
    async updateContext(research_interest: string, selected_note_ids: number[], selected_pdf_ids: number[] = []): Promise<{ message: string; note_count: number; pdf_count: number }> {
        return this._authenticatedRequest('/update-context', {
            method: 'POST',
            body: {
                research_interest,
                selected_note_ids,
                selected_pdf_ids
            }
        });
    }

    // Clean up privacy-sensitive user data
    async cleanupPrivacyData(): Promise<{ message: string; cleanup_results: any }> {
        return this._authenticatedRequest('/cleanup-privacy-data', {
            method: 'POST'
        });
    }




    // Note management
    async getNotes(): Promise<{ notes: any[]; total_count: number }> {
        return this._authenticatedRequest('/notes');
    }

    async createNote(file_path: string, content: string): Promise<any> {
        return this._authenticatedRequest('/notes', {
            method: 'POST',
            body: {
                file_path,
                content
            }
        });
    }

    async getNote(noteId: number): Promise<any> {
        return this._authenticatedRequest(`/notes/${noteId}`);
    }

    // PDF management
    async getPDFs(): Promise<{ pdfs: any[]; total_count: number }> {
        return this._authenticatedRequest('/pdfs');
    }

    async uploadPDFFromVault(vault_pdf_path: string, pdf_content: string, linked_note_id?: number): Promise<any> {
        return this._authenticatedRequest('/pdfs/upload-from-vault', {
            method: 'POST',
            body: {
                vault_pdf_path,
                pdf_content,  // Base64 encoded PDF content
                linked_note_id
            }
        }, this.LONG_REQUEST_TIMEOUT);
    }

    async linkPDFToNote(pdf_id: number, note_id: number): Promise<any> {
        return this._authenticatedRequest(`/pdfs/${pdf_id}/link-to-note`, {
            method: 'POST',
            body: {
                note_id
            }
        });
    }

    async deletePDF(pdf_id: number): Promise<any> {
        return this._authenticatedRequest(`/pdfs/${pdf_id}`, {
            method: 'DELETE'
        });
    }

    async unlinkNoteFromPDF(note_id: number): Promise<any> {
        return this._authenticatedRequest(`/notes/${note_id}/unlink-pdf`, {
            method: 'POST'
        });
    }

    // Get user's generated frames
    async getFrames(limit: number = 20, offset: number = 0, strategyFilter?: string): Promise<FrameListResponse> {
        let url = `/frames?limit=${limit}&offset=${offset}`;
        if (strategyFilter && strategyFilter !== 'all') {
            url += `&strategy_filter=${encodeURIComponent(strategyFilter)}`;
        }
        return this._authenticatedRequest(url);
    }

    // Get all user's frames (no pagination) for ranking
    async getAllFrames(): Promise<FrameListResponse> {
        return this._authenticatedRequest('/frames/all');
    }

    // Mark frames as viewed
    async markFramesViewed(frameIds: number[]): Promise<{ message: string }> {
        return this._authenticatedRequest('/frames/mark-viewed', {
            method: 'POST',
            body: frameIds
        });
    }

    // Delete a frame
    async deleteFrame(frameId: number): Promise<{ message: string }> {
        return this._authenticatedRequest(`/frames/${frameId}`, {
            method: 'DELETE'
        });
    }

    // Manually trigger frame generation
    async triggerFrameGeneration(strategy: string = 'all_content', researchQuestion: string): Promise<{ message: string; task_id: string; strategy: string; research_question: string }> {
        return this._authenticatedRequest('/generate-frame', {
            method: 'POST',
            body: {
                strategy,
                research_question: researchQuestion
            }
        });
    }

    // Trigger experiment batch generation
    async triggerExperimentBatchGeneration(questions: string[], repetitionsPerStrategy: number = 1, strategies?: string[]): Promise<{
        message: string;
        total_tasks: number;
        task_ids: string[];
        questions: string[];
        strategies: string[];
        repetitions_per_strategy: number;
        breakdown: {
            questions_count: number;
            strategies_count: number;
            repetitions_per_strategy: number;
        };
    }> {
        return this._authenticatedRequest('/generate-experiment-batch', {
            method: 'POST',
            body: {
                questions,
                repetitions_per_strategy: repetitionsPerStrategy,
                strategies: strategies || undefined
            }
        }, this.LONG_REQUEST_TIMEOUT);
    }

    // Frame Ranking Methods

    // Categorize frames for ranking
    async categorizeFrames(frameCategories: Record<number, string>): Promise<{ message: string }> {
        return this._authenticatedRequest('/frames/categorize', {
            method: 'POST',
            body: { frame_categories: frameCategories }
        });
    }

    // Get Swiss pairings for frame ranking
    async getRankingPairings(): Promise<RankingPairingsResponse> {
        return this._authenticatedRequest('/frames/ranking/pairings');
    }

    // Submit final ranking results
    async submitFrameRankings(comparisons: Array<{winner: number, loser: number}>): Promise<{ message: string, rankings: FrameRanking[] }> {
        return this._authenticatedRequest('/frames/rank', {
            method: 'POST',
            body: { comparisons }
        });
    }

    // Get past ranking results
    async getPastRankingResults(): Promise<PastRankingResponse> {
        return this._authenticatedRequest('/frames/past-rankings');
    }

    // Get user's current context
    async getUserContext(): Promise<UserContext> {
        return this._authenticatedRequest('/user-context');
    }

    // Get generation status
    async getGenerationStatus(): Promise<GenerationStatus> {
        return this._authenticatedRequest('/generation-status');
    }

    // Logout
    async logout(): Promise<{ message: string }> {
        try {
            return await this._authenticatedRequest('/logout', {
                method: 'POST'
            });
        } catch (error: any) {
            // Even if logout fails, we should clean up locally
            console.warn('Logout API call failed:', error.message);
            return { message: 'Logged out locally' };
        }
    }

    // Health check
    async healthCheck(): Promise<any> {
        try {
            const abortController = new AbortController();
            const timeoutId = setTimeout(() => {
                abortController.abort();
            }, 5000); // 5 second timeout

            const response = await fetch(`${this.settings.backendUrl}/health`, {
                signal: abortController.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`Health check failed: ${response.status} ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error: any) {
            if (error.name === 'AbortError') {
                throw new Error('Health check timeout: Backend took longer than 5 seconds to respond');
            }
            throw new Error(`Health check failed: ${error.message}`);
        }
    }

    // PDF Management Methods
    
    // Get user's PDFs
    async getUserPDFs(): Promise<PDFListResponse> {
        return this._authenticatedRequest('/pdfs');
    }
    
    
    // Add PDF from vault
    async addPDFFromVault(pdfPath: string): Promise<{ message: string; pdf: UserPDF }> {
        return this._authenticatedRequest('/pdfs/add-from-vault', {
            method: 'POST',
            body: { pdf_path: pdfPath }
        }, this.LONG_REQUEST_TIMEOUT);
    }
    
    // List vault PDFs (removed - now handled in frontend)
    
    // Update PDF selections
    async updatePDFSelections(selections: Record<number, boolean>): Promise<{ message: string }> {
        return this._authenticatedRequest('/pdfs/selections', {
            method: 'PUT',
            body: { pdf_selections: selections }
        });
    }
    
    // Extract PDF fulltext
    async extractPDFFulltext(pdfIds: number[]): Promise<{ message: string; results: Array<any> }> {
        return this._authenticatedRequest('/pdfs/extract-fulltext', {
            method: 'POST',
            body: { pdf_ids: pdfIds }
        }, this.LONG_REQUEST_TIMEOUT);
    }

    
    // Get available strategies
    async getAvailableStrategies(): Promise<AvailableStrategiesResponse> {
        return this._authenticatedRequest('/available-strategies');
    }

    
}