# Complete Codebase Documentation - Research Frames Plugin

This document provides comprehensive technical documentation for the Obsidian Research Frames plugin, covering all systems from authentication to frame generation, database management, WebSocket communication, and frontend state management.

## System Architecture Overview

The plugin consists of:
- **Frontend**: React/TypeScript Obsidian plugin with Chakra UI
- **Backend**: Python FastAPI server with PostgreSQL database
- **Communication**: REST API + WebSocket for real-time updates
- **AI Integration**: vLLM server running Meta Llama models
- **Queue System**: Persistent pickle-based task queue with real-time notifications

## Codebase Structure

```
obsidian_plugin/
├── src/                          # Frontend TypeScript/React
│   ├── api.ts                   # API client and interfaces
│   ├── store/frameStore.ts      # Zustand state management
│   ├── components/              # React components
│   └── contexts/                # React contexts
├── obsidian_plugin_backend/     # Python FastAPI backend
│   ├── main.py                  # FastAPI app and endpoints
│   ├── db/                      # Database layer
│   ├── modules/                 # Core business logic
│   ├── handlers/                # External service handlers
│   └── prompts.py              # LLM prompt templates
├── main.tsx                     # Obsidian plugin entry point
└── manifest.json               # Plugin configuration
```

## Authentication & Security System

### Authentication Flow Overview
```
User Credentials → bcrypt Validation → Session Token Generation → In-Memory Storage → JWT-like Authorization
```

### Backend Authentication Architecture

#### Password Hashing System
**Location**: `obsidian_plugin_backend/db/users.py:14`

1. **User Creation** (`create_user()`):
   ```python
   password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
   ```
   - Uses bcrypt with auto-generated salt
   - Stores hash in `users.password_hash` column (VARCHAR(255))
   - Returns None if username already exists (UniqueViolationError)

2. **Password Verification** (`authenticate_user()`):
   ```python
   bcrypt.checkpw(password.encode('utf-8'), row['password_hash'].encode('utf-8'))
   ```
   - Retrieves stored hash from database
   - Compares with bcrypt.checkpw()
   - Only processes active users (`is_active = TRUE`)

#### Session Token Management
**Location**: `obsidian_plugin_backend/main.py`

1. **Token Generation** (`generate_session_id()`):
   ```python
   return secrets.token_hex(16)  # 32-character hex string
   ```
   - Uses cryptographically secure random generation
   - Creates 32-character hexadecimal tokens
   - No expiration time (tokens persist until logout/restart)

2. **Session Storage**:
   ```python
   active_sessions: Dict[str, int] = {}  # {session_token: user_id}
   ```
   - **In-Memory Storage**: Dict mapping tokens to user IDs
   - **Persistence**: Lost on server restart (users must re-login)
   - **Thread-Safe**: Python dict operations are atomic
   - **Cleanup**: Manual removal on logout

3. **Authentication Middleware** (`get_authenticated_user()`):
   ```python
   credentials: HTTPAuthorizationCredentials = Security(security)
   session_id = credentials.credentials
   user_id = active_sessions.get(session_id)
   ```
   - **Bearer Token**: Uses FastAPI HTTPBearer security
   - **Header Format**: `Authorization: Bearer <session_token>`
   - **Validation**: Checks token exists in active_sessions
   - **User Lookup**: Fetches full User object from database
   - **Error Handling**: Returns 401 Unauthorized if invalid

### Frontend Authentication System

#### Token Storage & Management
**Location**: `src/store/frameStore.ts`

1. **Zustand State**:
   ```typescript
   interface FrameStore {
     isAuthenticated: boolean;
     authToken: string | null;
     username: string | null;
   }
   ```
   - **Storage**: In-memory only (React state)
   - **Persistence**: Lost on page refresh/plugin reload
   - **Thread-Safe**: Zustand handles concurrent updates

2. **Authentication Actions**:
   ```typescript
   setAuthenticated: (token: string, username: string) => set({ 
     isAuthenticated: true, 
     authToken: token, 
     username: username,
     currentView: ViewMode.SETUP  // Auto-navigate after login
   })
   ```

#### API Client Integration
**Location**: `src/api.ts:AsyncResearchApi`

1. **Token Injection**:
   ```typescript
   updateAuthToken(token: string) {
     this.settings.token = token;
   }
   ```
   - Updates token in API client settings
   - All subsequent requests use new token

2. **Request Headers**:
   ```typescript
   const requestHeaders: Record<string, string> = {
     'Content-Type': 'application/json',
     'Authorization': `Bearer ${this.settings.token}`,
   };
   ```
   - Automatic bearer token injection
   - Applied to all authenticated endpoints

3. **Error Handling**:
   ```typescript
   if (response.status === 401) {
     throw new Error('Authentication expired. Please authenticate again.');
   }
   ```
   - Detects authentication failures
   - Throws user-friendly error messages
   - Frontend can catch and redirect to login

### Login Process (Detailed Step-by-Step)

#### Step 1: User Credential Input
**Location**: `src/components/views/LoginView.tsx`

1. User enters credentials in controlled form inputs
2. Form validation (basic field presence checks)
3. Submit triggers `handleLogin()` function
4. Loading state prevents multiple submissions

#### Step 2: API Authentication Call
**Location**: `src/api.ts:273` (`authenticate()`)

1. **HTTP Request**:
   ```typescript
   const response = await fetch(`${this.settings.backendUrl}/login`, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ username, password })
   });
   ```

2. **Error Handling**:
   - 401: "Invalid username or password"
   - Other errors: Uses response.statusText
   - Network errors: Propagated to UI

#### Step 3: Backend Authentication
**Location**: `obsidian_plugin_backend/main.py:194` (`/login` endpoint)

1. **User Lookup**:
   ```python
   user = await users_repo.authenticate_user(request.username, request.password)
   ```
   - Calls bcrypt verification
   - Returns None if invalid credentials

2. **New User Creation**:
   ```python
   if not user:
     user = await users_repo.create_user(request.username, request.password)
     is_new_user = True
   ```
   - Auto-creates users on first login
   - Sets is_new_user flag for frontend

3. **Session Creation**:
   ```python
   session_id = generate_session_id()
   active_sessions[session_id] = user.id
   ```
   - Generates cryptographic token
   - Stores in server memory

4. **Response**:
   ```python
   return LoginResponse(
     username=user.username,
     user_id=user.id,
     is_new_user=is_new_user,
     session_token=session_id
   )
   ```

#### Step 4: Frontend Token Storage
**Location**: `src/components/views/LoginView.tsx:handleLogin()`

1. **API Client Update**:
   ```typescript
   api.updateAuthToken(data.session_token);
   ```

2. **Store Update**:
   ```typescript
   setAuthenticated(data.session_token, data.username);
   ```
   - Updates Zustand store
   - Triggers view change to SETUP
   - Clears any error states

### WebSocket Authentication
**Location**: `obsidian_plugin_backend/main.py:655` (`/ws/{session_token}`)

1. **URL-Based Token**:
   ```python
   @app.websocket("/ws/{session_token}")
   async def websocket_endpoint(websocket: WebSocket, session_token: str):
   ```
   - Token passed in WebSocket URL path
   - Required because WebSocket headers are limited

2. **Authentication Process**:
   ```python
   user_id = active_sessions.get(session_token)
   if not user_id:
     await websocket.close(code=1008, reason="Invalid session")
     return
   ```
   - **Code 1008**: Policy Violation (invalid authentication)
   - **Immediate Closure**: No further communication allowed

3. **Frontend WebSocket Connection**:
   ```typescript
   const wsUrl = this.settings.backendUrl.replace('http', 'ws') + `/ws/${this.settings.token}`;
   this.websocket = new WebSocket(wsUrl);
   ```

## Database Architecture & Connection Management

### Connection Pool System
**Location**: `obsidian_plugin_backend/db/connection.py:DatabaseConnection`

1. **Pool Initialization**:
   ```python
   self.pool = await asyncpg.create_pool(self.db_url)
   ```
   - **Default URL**: `postgresql://localhost/research_frames`
   - **Pool Management**: asyncpg handles connection reuse
   - **Environment Override**: Uses `DATABASE_URL` env var

2. **Connection Acquisition Pattern**:
   ```python
   async with self.db.pool.acquire() as conn:
     # Database operations
   ```
   - **Auto-Management**: Connection returned to pool automatically
   - **Exception Safety**: Connections released even on errors
   - **Concurrency**: Multiple operations can run simultaneously

### Database Schema (Complete)

#### Users Table
```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);
```
- **Constraints**: Unique username, NOT NULL password
- **Indexing**: Automatic on PRIMARY KEY and UNIQUE columns
- **Soft Delete**: is_active flag instead of deletion

#### User Contexts Table  
```sql
CREATE TABLE user_contexts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    research_interest TEXT NOT NULL,
    notes_content TEXT NOT NULL,
    pdf_content TEXT DEFAULT '[]',
    updated_at TIMESTAMP DEFAULT NOW()
);
```
- **One-to-One**: UNIQUE constraint on user_id
- **JSON Storage**: notes_content and pdf_content as TEXT
- **Cascade**: Deletes when user is deleted

#### Frames Table
```sql
CREATE TABLE frames (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    perspective TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    generation_time_minutes FLOAT DEFAULT 0,
    is_viewed BOOLEAN DEFAULT FALSE
);
```
- **Performance Indexes**: 
  - `idx_frames_user_id ON frames(user_id)`
  - `idx_frames_created_at ON frames(created_at DESC)`

#### User PDFs Table
```sql
CREATE TABLE user_pdfs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    upload_date TIMESTAMP DEFAULT NOW(),
    is_selected BOOLEAN DEFAULT TRUE,
    source VARCHAR(20) DEFAULT 'upload'
);
```
- **File Tracking**: Both internal filename and original name
- **Selection State**: is_selected for frame generation
- **Source Tracking**: 'upload' vs 'vault' origin

#### User Tokens Table (Future Use)
```sql
CREATE TABLE user_tokens (
    token VARCHAR(64) PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL
);
```
- **Note**: Currently unused (in-memory sessions used instead)
- **Future**: For persistent token storage with expiration

### Repository Pattern Implementation

All database operations use the Repository pattern with dependency injection:

1. **Base Pattern** (`db/users.py` example):
   ```python
   class UserRepository:
     def __init__(self, db_connection):
       self.db = db_connection
   
     async def method(self) -> Type:
       async with self.db.pool.acquire() as conn:
         # SQL operations
   ```

2. **Dependency Injection** (`db/__init__.py`):
   ```python
   db_connection = DatabaseConnection()
   users_repo = UserRepository(db_connection)
   ```

3. **FastAPI Integration** (`main.py`):
   ```python
   from db import users_repo, context_repo, frames_repo, pdfs_repo
   ```

## WebSocket Real-Time Communication System

### WebSocket Architecture Overview
```
User Action → Queue Event → WebSocket Message → Frontend State Update → UI Refresh
```

### Backend WebSocket Management
**Location**: `obsidian_plugin_backend/main.py:WebSocketManager`

#### Connection Management Class
```python
class WebSocketManager:
    def __init__(self):
        self.active_connections: Dict[int, WebSocket] = {}  # {user_id: websocket}
    
    async def connect(self, user_id: int, websocket: WebSocket):
        self.active_connections[user_id] = websocket
    
    async def disconnect(self, user_id: int):
        if user_id in self.active_connections:
            del self.active_connections[user_id]
    
    async def send_personal_message(self, user_id: int, message: dict):
        if user_id in self.active_connections:
            await self.active_connections[user_id].send_text(json.dumps(message))
```

#### Message Types & Formats

1. **Queue Status Updates**:
   ```json
   {
     "type": "queue_update",
     "queue_status": {
       "pending": 2,
       "processing": 1,
       "pending_positions": [1, 2],
       "total_queue_length": 3,
       "estimated_wait_time": 4.5
     },
     "background_worker_status": "processing"
   }
   ```

2. **Task Completion**:
   ```json
   {
     "type": "task_completed",
     "queue_status": {...},
     "background_worker_status": "idle"
   }
   ```

3. **Task Failure**:
   ```json
   {
     "type": "task_failed",
     "error": "LLM service unavailable",
     "queue_status": {...}
   }
   ```

#### WebSocket Connection Flow

1. **Client Connection** (`/ws/{session_token}`):
   ```python
   async def websocket_endpoint(websocket: WebSocket, session_token: str):
       await websocket.accept()  # Must accept first
       
       # Authentication
       user_id = active_sessions.get(session_token)
       if not user_id:
           await websocket.close(code=1008, reason="Invalid session")
           return
       
       # Register connection
       await websocket_manager.connect(user_id, websocket)
   ```

2. **Message Handling Loop**:
   ```python
   try:
       while True:
           data = await websocket.receive_text()
           message = json.loads(data)
           
           if message.get("type") == "ping":
               await websocket.send_text(json.dumps({"type": "pong"}))
   except WebSocketDisconnect:
       await websocket_manager.disconnect(user_id)
   ```

3. **Broadcast to User** (from queue operations):
   ```python
   await websocket_manager.send_personal_message(user_id, {
       "type": "queue_update",
       "queue_status": queue_status
   })
   ```

### Frontend WebSocket Integration
**Location**: `src/api.ts:AsyncResearchApi`

#### Connection Management

1. **Connection Establishment**:
   ```typescript
   connectWebSocket(): void {
     const wsUrl = this.settings.backendUrl.replace('http', 'ws') + `/ws/${this.settings.token}`;
     this.websocket = new WebSocket(wsUrl);
     
     this.websocket.onopen = () => {
       console.log('✅ WebSocket connected successfully');
     };
   }
   ```

2. **Message Processing**:
   ```typescript
   this.websocket.onmessage = (event) => {
     const message = JSON.parse(event.data);
     this.handleWebSocketMessage(message);
   };
   
   private handleWebSocketMessage(message: any): void {
     if (message.type === 'queue_update') {
       this.websocketCallbacks.forEach((callback) => {
         callback(message);
       });
     }
   }
   ```

3. **Callback Registration System**:
   ```typescript
   onQueueUpdate(callback: (data: any) => void): void {
     const callbackId = Math.random().toString(36);
     this.websocketCallbacks.set(callbackId, callback);
   }
   ```

4. **Automatic Reconnection**:
   ```typescript
   this.websocket.onclose = (event) => {
     if (event.code === 1008) {
       // Invalid session - clear token and logout
       this.settings.token = '';
       if (this.onLogoutCallback) this.onLogoutCallback();
     } else {
       // Network issue - could implement retry logic here
       console.warn('🔄 WebSocket disconnected - manual reconnect required');
     }
   };
   ```

### Frontend WebSocket Message Handling
**Location**: `src/components/AsyncResearchView.tsx:handleWebSocketMessage()`

```typescript
const handleWebSocketMessage = (data: any) => {
  switch (data.type) {
    case 'queue_update':
      setGenerationStatus(prev => ({
        ...(prev || {}),
        queue_status: data.queue_status,
        background_worker_status: data.background_worker_status || 'idle'
      }));
      break;
      
    case 'task_completed': {
      setGenerationStatus(prev => ({
        ...(prev || {}),
        new_frames_available: (prev?.new_frames_available || 0) + 1
      }));
      
      // Auto-refresh frames when queue becomes empty
      const queueEmpty = data.queue_status?.pending === 0 && data.queue_status?.processing === 0;
      if (queueEmpty) {
        api.getFrames(50, 0).then(response => {
          setFrames(response.frames, response.total_count, response.new_frames_count);
          setCurrentPage(1);
        });
      }
      break;
    }
  }
};
```

## Frontend State Management (Zustand Store)

### Store Architecture
**Location**: `src/store/frameStore.ts`

#### Complete State Interface
```typescript
interface FrameStore {
  // Authentication
  isAuthenticated: boolean;
  authToken: string | null;
  username: string | null;
  
  // Navigation
  currentView: ViewMode;
  
  // Data
  userContext: UserContext | null;
  frames: Frame[];
  totalFrameCount: number;
  newFrameCount: number;
  generationStatus: GenerationStatus | null;
  
  // UI State
  isLoading: boolean;
  error: string | null;
  
  // Pagination
  currentPage: number;
  framesPerPage: number;
  
  // Callbacks
  frameRefreshCallback: (() => Promise<void>) | null;
}
```

#### State Management Patterns

1. **Immutable Updates**:
   ```typescript
   setFrames: (frames: Frame[], totalCount: number, newCount: number) => 
     set({ frames, totalFrameCount: totalCount, newFrameCount: newCount });
   ```

2. **Computed Values**:
   ```typescript
   hasUserContext: () => {
     const context = get().userContext;
     return context?.research_interest.length > 0 && 
            context?.notes_content.length > 0;
   };
   ```

3. **Conditional State Updates**:
   ```typescript
   setGenerationStatus: (status: GenerationStatus | ((prev: GenerationStatus | null) => GenerationStatus)) => 
     set(state => ({
       generationStatus: typeof status === 'function' ? status(state.generationStatus) : status
     }));
   ```

#### Subscription System
```typescript
export const useFrameStore = create<FrameStore>()(
  subscribeWithSelector((set, get) => ({
    // Store implementation
  }))
);

// Usage in components:
const { frames, setFrames } = useFrameStore();

// Subscription to specific state changes:
useFrameStore.subscribe(
  (state) => state.isAuthenticated,
  (isAuthenticated) => {
    if (isAuthenticated) {
      // Connect WebSocket when authenticated
    }
  }
);
```

## File Handling & PDF Management System

### PDF Upload & Vault Integration

#### Vault PDF Discovery
**Location**: `src/components/SimplePDFSelector.tsx`

1. **Obsidian Vault Scanning**:
   ```typescript
   const scanForPDFs = async (): Promise<VaultPDF[]> => {
     const files = app.vault.getFiles();
     return files
       .filter(file => file.extension === 'pdf')
       .map(file => ({
         filename: file.name,
         file_path: file.path,
         file_size: file.stat.size,
         modified_at: file.stat.mtime
       }));
   };
   ```

2. **PDF File Information**:
   - **Path**: Full vault path (`folder/document.pdf`)
   - **Size**: File size in bytes
   - **Modified Time**: Last modification timestamp
   - **Duplicate Detection**: Checks against already-added PDFs

#### Backend PDF Processing
**Location**: `obsidian_plugin_backend/modules/pdf_manager.py`

1. **File System Operations**:
   ```python
   class PDFManager:
     async def add_pdf_from_vault(self, user_id: int, pdf_path: str):
       # Copy from vault to user directory
       user_dir = f"user_{user_id}_pdfs"
       os.makedirs(user_dir, exist_ok=True)
       
       filename = os.path.basename(pdf_path)
       destination = os.path.join(user_dir, filename)
       shutil.copy2(pdf_path, destination)
   ```

2. **Database Storage**:
   ```python
   pdf = await pdfs_repo.create_pdf(
     user_id=user_id,
     filename=internal_filename,
     original_filename=original_name,
     file_path=destination_path,
     file_size=file_size,
     source='vault'
   )
   ```

### PDF Fulltext Extraction
**Location**: `obsidian_plugin_backend/modules/pdf_fulltext_extractor.py`

#### Extraction Process
```python
class PDFFulltextExtractor:
    async def extract_fulltext(self, pdf_path: str) -> Dict[str, Any]:
        try:
            # Use PyMuPDF (fitz) for text extraction
            doc = fitz.open(pdf_path)
            full_text = ""
            
            for page_num in range(len(doc)):
                page = doc[page_num]
                full_text += page.get_text()
            
            # Save to file
            output_path = f"{pdf_path}.fulltext.txt"
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(full_text)
                
            return {
                "file_path": output_path,
                "pages_processed": len(doc),
                "word_count": len(full_text.split()),
                "success": True
            }
        except Exception as e:
            return {"success": False, "error": str(e)}
```

#### Database Integration
**Location**: `obsidian_plugin_backend/db/pdf_fulltext.py`

```python
async def create_pdf_fulltext(self, pdf_id: int, file_path: str, 
                            pages_processed: int, word_count: int) -> Optional[PDFFulltext]:
    async with self.db.pool.acquire() as conn:
        row = await conn.fetchrow('''
            INSERT INTO pdf_fulltext (pdf_id, file_path, pages_processed, word_count)
            VALUES ($1, $2, $3, $4)
            RETURNING id, pdf_id, file_path, pages_processed, word_count, created_at
        ''', pdf_id, file_path, pages_processed, word_count)
        
        return PDFFulltext(**dict(row))
```

## Error Handling & Logging System

### Backend Error Handling

#### FastAPI Exception Handling
**Location**: `obsidian_plugin_backend/main.py`

1. **Authentication Errors**:
   ```python
   @app.exception_handler(HTTPException)
   async def http_exception_handler(request, exc):
       if exc.status_code == 401:
           return JSONResponse(
               status_code=401,
               content={"detail": "Authentication required"}
           )
   ```

2. **Database Errors**:
   ```python
   try:
       result = await database_operation()
   except asyncpg.UniqueViolationError:
       raise HTTPException(status_code=400, detail="Resource already exists")
   except asyncpg.PostgresError as e:
       raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
   ```

3. **LLM Service Errors**:
   ```python
   try:
       response = self.llm.generate(prompt)
   except requests.exceptions.ConnectionError:
       raise HTTPException(status_code=503, detail="LLM service unavailable")
   except requests.exceptions.Timeout:
       raise HTTPException(status_code=504, detail="LLM request timeout")
   ```

#### Logging Configuration
**Location**: `obsidian_plugin_backend/modules/background_worker.py`

```python
import logging

logger = logging.getLogger(__name__)

# Usage throughout the application:
logger.info(f"Starting perspective generation for user {task.user_id}")
logger.error(f"Failed to generate perspective for task {task.task_id}: {e}")
logger.warning(f"No user_id available for research objects")
```

### Frontend Error Handling

#### API Error Handling
**Location**: `src/api.ts:AsyncResearchApi._authenticatedRequest()`

```typescript
try {
  const response = await fetch(url, options);
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Authentication expired. Please authenticate again.');
    }
    
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Error ${response.status}: ${errorData.detail || response.statusText}`);
  }
  
  return await response.json();
} catch (error) {
  if (error.name === 'AbortError') {
    throw new Error(`Request timeout: ${endpoint} took longer than ${this.REQUEST_TIMEOUT / 1000} seconds`);
  }
  throw error;
}
```

#### Component Error Boundaries
**Location**: `src/components/AsyncResearchView.tsx`

```typescript
const AsyncResearchView: React.FC = () => {
  const { error, setError } = useFrameStore();
  
  // Error display
  if (error) {
    return (
      <Alert status="error">
        <AlertIcon />
        <AlertTitle>Error!</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
        <CloseButton onClick={() => setError(null)} />
      </Alert>
    );
  }
  
  // Rest of component
};
```

#### Toast Notifications
**Location**: `src/components/cards/FrameCard.tsx`

```typescript
const toast = useToast();

try {
  await onDelete(frame.id);
  toast({
    title: 'Frame deleted',
    description: `Frame "${frame.title}" has been deleted successfully`,
    status: 'success',
    duration: 3000,
    isClosable: true,
  });
} catch (error: any) {
  toast({
    title: 'Error deleting frame',
    description: error.message || 'Failed to delete frame',
    status: 'error',
    duration: 5000,
    isClosable: true,
  });
}
```

## Frame Generation Process (Complete Technical Flow)

### High-Level Flow
```
User Authentication → Context Setup → Task Queue → Background Processing → Content Extraction → LLM Generation → Database Storage → WebSocket Notification → Frontend Update
```

## Detailed Frame Generation Process

### Phase 1: User Interaction & Context Setup

#### Step 1.1: User Authentication
**Location**: `src/components/views/LoginView.tsx`

1. User enters username/password in the LoginView component
2. Frontend calls `AsyncResearchApi.authenticate()` (`src/api.ts:273`)
3. Backend validates credentials via `/login` endpoint (`obsidian_plugin_backend/main.py:235`)
4. If successful, backend returns session token and user info
5. Frontend stores token and updates authentication state in Zustand store

#### Step 1.2: Research Context Configuration
**Location**: `src/components/views/SetupView.tsx`

1. User navigates to SetupView after authentication
2. User enters research interest (minimum 5 characters required)
3. User selects notes using FileSelector component:
   - FileSelector scans Obsidian vault for `.md` files
   - User can select/deselect individual note files
   - Selected files are stored as an array of file paths
4. User can optionally select PDFs (if any are uploaded)
5. Real-time validation ensures minimum requirements are met

#### Step 1.3: Context Submission
**Location**: `src/components/views/SetupView.tsx:handleSaveContext()`

1. User clicks "Save Context" button
2. Frontend packages research interest and selected files
3. Calls `AsyncResearchApi.updateContext()` (`src/api.ts:292`)
4. API sends POST request to `/update-context` endpoint

### Phase 2: Backend Context Processing

#### Step 2.1: Context Storage
**Location**: `obsidian_plugin_backend/main.py:419` (`/update-context` endpoint)

1. Backend receives context update request
2. Validates user authentication via JWT token
3. Extracts research interest, notes content, and PDF content from request
4. Calls `context_repo.update_user_context()` (`db/context.py:10`)
5. Database stores/updates user context in `user_contexts` table

#### Step 2.2: Task Queue Creation
**Location**: `obsidian_plugin_backend/main.py:437`

1. Creates new FrameGenerationTask with user_id and unique task_id
2. Adds task to frame_queue (`modules/frame_queue.py`)
3. Queue persists task to pickle file for crash recovery
4. WebSocket notification sent to user about task being queued
5. Returns success response with task_id to frontend

### Phase 3: Background Processing

#### Step 3.1: Queue Monitoring
**Location**: `modules/background_worker.py:32` (`BackgroundFrameGenerator.run()`)

1. Background worker runs continuous loop every 5 seconds
2. Calls `_process_queue_tasks()` to check for pending tasks
3. Gets next available task via `frame_queue.get_next_task()`
4. If task found, creates async task for `_generate_frame_for_task()`
5. Multiple tasks can be processed concurrently

#### Step 3.2: Task Processing Initialization  
**Location**: `modules/background_worker.py:79` (`_generate_frame_for_task()`)

1. Marks task as PROCESSING in queue
2. Records start time for generation metrics
3. Retrieves user context from database via `context_repo.get_user_context()`
4. Parses notes_content and pdf_content from JSON strings
5. Logs context data summary (number of notes/PDFs)

### Phase 4: Content Extraction & Processing

#### Step 4.1: Content Snippet Extraction
**Location**: `modules/background_worker.py:148` (`_extract_content_snippets()`)

**For Notes Processing:**
1. Iterates through first 3 selected notes
2. For each note:
   - If note is a string (file path): uses path as reference
   - If note is a dict (content object): extracts actual content
   - Takes first 200 characters of content as snippet
   - Formats as "Note from {path}: {snippet}..."

**For PDFs Processing:**
1. Iterates through first 2 selected PDFs
2. For each PDF:
   - If PDF is a string (file path): uses path as reference
   - If PDF is a dict: extracts filename from 'original_filename'
   - Only includes if 'is_selected' is True
   - Formats as "PDF: {filename}"

3. Returns maximum of 5 content snippets total

#### Step 4.2: Research Interest Context
**Location**: `modules/background_worker.py:125`

1. Research interest text is passed directly to perspective generation
2. No additional processing or analysis performed on research interest
3. Used as primary creative prompt context for LLM generation

### Phase 5: LLM-Based Frame Generation

#### Step 5.1: Prompt Construction
**Location**: `modules/background_worker.py:193` (`_create_perspective_prompt()`)

1. Creates focused prompt combining research interest and content snippets
2. Prompt structure:
   ```
   Based on the research interest and content below, generate a creative, 
   unexpected research perspective that the user might not have considered.
   
   Research Interest: {research_interest}
   
   Available Content:
   - {content_snippet_1}
   - {content_snippet_2}
   - ...
   
   [Instructions for title and perspective format]
   ```

3. Emphasizes creativity and unexpected angles
4. Requests specific format: "TITLE: ..." and "PERSPECTIVE: ..."

#### Step 5.2: LLM Generation Call
**Location**: `modules/background_worker.py:134`

1. Uses LLMHandler with configured model (`handlers/llm_handler.py`)
2. Generation parameters:
   - **Temperature**: 0.8 (high creativity)
   - **Max Tokens**: 300 (ensures conciseness)
   - **Model**: Default model from ModelType.get_default()
3. Calls `self.llm.generate()` with constructed prompt

#### Step 5.3: Response Parsing
**Location**: `modules/background_worker.py:217` (`_parse_perspective_response()`)

1. Receives raw LLM response text
2. Searches for "TITLE:" and "PERSPECTIVE:" markers
3. Extracts title (cleans and limits to reasonable length)
4. Extracts perspective content
5. **Fallback Handling**: If parsing fails, returns:
   - Title: "A Fresh Research Perspective" 
   - Perspective: Generic creative perspective text
6. Returns structured title and perspective

### Phase 6: Frame Storage & Completion

#### Step 6.1: Database Storage
**Location**: `modules/background_worker.py:107`

1. Calculates generation time: `(end_time - start_time) / 60` minutes
2. Calls `frames_repo.store_frame()` (`db/frames.py:10`) with:
   - user_id
   - title (from LLM response)
   - perspective (from LLM response)  
   - generation_time_minutes
3. Database inserts into frames table with auto-generated ID and timestamp
4. Returns Frame object with all metadata

#### Step 6.2: Task Completion
**Location**: `modules/background_worker.py:115`

1. Marks task as COMPLETED in queue via `frame_queue.complete_task()`
2. Logs successful generation with frame ID and timing
3. Queue cleanup removes completed task from active processing

#### Step 6.3: Error Handling
**Location**: `modules/background_worker.py:135`

If any step fails:
1. Catches exception and logs error details
2. Marks task as FAILED via `frame_queue.fail_task()`
3. Stores error message for debugging
4. WebSocket notifies frontend of failure

### Phase 7: Real-Time Communication

#### Step 7.1: WebSocket Notifications
**Location**: `obsidian_plugin_backend/main.py:WebSocketManager`

Throughout the process, WebSocket messages are sent:
1. **Task Added**: When task is queued (`task_added`)
2. **Task Processing**: When background worker starts processing (`queue_update`)  
3. **Task Completed**: When frame generation succeeds (`task_completed`)
4. **Task Failed**: If generation fails (`task_failed`)

Message format:
```json
{
  "type": "task_completed",
  "queue_status": {
    "pending": 0,
    "processing": 0,
    "pending_positions": [],
    "total_queue_length": 0
  },
  "background_worker_status": "idle"
}
```

#### Step 7.2: Frontend WebSocket Handling
**Location**: `src/components/AsyncResearchView.tsx:handleWebSocketMessage()`

1. Frontend receives WebSocket messages
2. Updates generation status in Zustand store
3. For `task_completed` messages:
   - Increments new frames counter
   - If queue becomes empty, triggers frame refresh
   - Automatically loads latest frames and resets to page 1

### Phase 8: Frontend Frame Display

#### Step 8.1: Frame Retrieval
**Location**: `src/api.ts:316` (`AsyncResearchApi.getFrames()`)

1. When queue becomes empty, frontend automatically calls `/frames` endpoint
2. Request includes pagination: `?limit=5&offset=0` for first page
3. Backend queries database and returns:
   ```json
   {
     "frames": [...],
     "total_count": 10,
     "new_frames_count": 1
   }
   ```

#### Step 8.2: Frame Rendering
**Location**: `src/components/views/FrameBrowserView.tsx`

1. Frames are displayed in paginated list (5 per page)
2. Each frame rendered as FrameCard component
3. **Visual Indicators**:
   - "NEW" badge for unviewed frames
   - Color-coded generation time badges (green<2min, yellow<5min, red>5min)
   - Unique accent colors per frame based on frame ID

#### Step 8.3: Frame Interaction
**Location**: `src/components/cards/FrameCard.tsx`

**Compact View (Default)**:
- Shows title, first ~120 chars of perspective
- Generation time and creation date
- Click to expand/collapse

**Expanded View (Selected)**:
- Full perspective with markdown rendering
- "Read more/less" collapsible content
- "View Details" button for full modal

**Full Modal**:
- Complete perspective content
- Markdown-formatted display
- Generation metadata
- Close action

### Phase 9: Post-Generation Management

#### Step 9.1: Frame Status Management
**Location**: `src/api.ts:321` (`markFramesViewed()`)

1. When user interacts with frames, they can be marked as viewed
2. Updates `is_viewed` flag in database
3. Removes "NEW" badge from UI

#### Step 9.2: Frame Deletion
**Location**: `src/api.ts:329` (`deleteFrame()`)

1. User can delete frames via delete button on cards
2. Calls `/frames/{frameId}` DELETE endpoint
3. Removes frame from database and updates UI
4. Shows success/error toast notifications

## Technical Implementation Details

### Database Schema

**frames table**:
```sql
CREATE TABLE frames (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    perspective TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    generation_time_minutes FLOAT DEFAULT 0,
    is_viewed BOOLEAN DEFAULT FALSE
);
```

### Error Handling & Recovery

1. **Queue Persistence**: Tasks survive server restarts via pickle files
2. **WebSocket Reconnection**: Frontend automatically reconnects on disconnect
3. **Generation Failures**: Failed tasks are logged with error details
4. **Database Failures**: Transactions ensure data consistency
5. **LLM Failures**: Fallback responses prevent total failure

### Performance Optimizations

1. **Pagination**: Only loads 5 frames per page to handle large collections
2. **Async Processing**: Non-blocking frame generation
3. **Connection Pooling**: Efficient database connections
4. **Content Limiting**: Only processes first 3 notes and 2 PDFs
5. **Token Limiting**: Max 300 tokens prevents excessive generation time

## Configuration & Customization

### LLM Parameters
- **Temperature**: 0.8 (creativity vs consistency balance)
- **Max Tokens**: 300 (concise but complete perspectives)
- **Model**: Configurable via ModelType in handlers/llm_handler.py

### Queue Settings  
- **Check Interval**: 5 seconds (background worker polling)
- **Cleanup Interval**: 3600 seconds (1 hour for old task cleanup)
- **Task Timeout**: No explicit timeout (relies on LLM timeouts)

### Content Limits
- **Notes**: First 3 selected notes, 200 chars each
- **PDFs**: First 2 selected PDFs (by filename)
- **Total Snippets**: Maximum 5 content snippets
- **Pagination**: 5 frames per page in frontend

This complete process ensures reliable, scalable frame generation with real-time feedback and robust error handling, providing users with creative research perspectives based on their selected content and interests.