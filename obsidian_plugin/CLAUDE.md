# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Frontend (Obsidian Plugin)
- `npm run dev` - Start development build with watch mode
- `npm run build` - Build production bundle (includes TypeScript type checking)
- `npm run lint` - Lint TypeScript/TSX files in src/
- `npm run lint:fix` - Auto-fix linting issues
- `npm run version` - Bump version in manifest.json and versions.json

### Testing Commands
- Run `npm run lint` after making changes to ensure code quality
- Run `npm run build` to verify TypeScript compilation

### Backend (Python FastAPI)
- `cd obsidian_plugin_backend && ./run_all.sh` - Start all services (PostgreSQL, LLM server, API server) in tmux sessions
- `cd obsidian_plugin_backend && python main.py` - Run API server only
- `cd obsidian_plugin_backend && ./run_llm.sh` - Run LLM server only
- `cd obsidian_plugin_backend && ./run_server.sh` - Run API server in tmux session
- `cd obsidian_plugin_backend && docker-compose up` - Start PostgreSQL database
- `cd obsidian_plugin_backend && python inspect_db.py` - Inspect database contents
- `cd obsidian_plugin_backend && ./reset_database.py` - Reset database schema and data
- `cd obsidian_plugin_backend && ./stop_all.sh` - Stop all running services

## Architecture Overview

This is a simplified research frames plugin for Obsidian that generates AI-powered research insights directly from notes and PDFs using Meta Llama models.

### Frontend Architecture
- **Main Plugin**: `main.tsx` - Entry point, registers Obsidian view and settings tab
- **React UI**: Built with Chakra UI and React 18, bundled with esbuild
- **State Management**: Zustand store (`src/store/frameStore.ts`) with pagination and WebSocket integration
- **API Client**: `src/api.ts` - Handles authentication, WebSocket connections, and backend communication
- **Components**: Modular React components in `src/components/` with shared UI elements
  - `FileSelector.tsx` - Obsidian vault file selection
  - `ProgressConsole.tsx` - Real-time progress monitoring with WebSocket streaming
  - `ResearchObjectsView.tsx` - Research object management interface
  - Error boundary and loading components

### Backend Architecture
- **FastAPI Server**: `obsidian_plugin_backend/main.py` - Async API with JWT authentication and WebSocket support
- **Database**: PostgreSQL with async connection pooling (`db/connection.py`)
- **Strategic Background Worker**: `modules/strategic_background_worker.py` - Processes frame generation using research objects and strategies
- **Queue Management**: `modules/frame_queue.py` - Persistent task queue with real-time status updates
- **Direct Content Processing**: `modules/content_processor.py` - Prepares notes and PDFs directly for frame generation
- **Strategy System**: Multiple frame generation strategies (`strategies/`) that work directly with raw content
- **Privacy Cleanup**: `modules/privacy_cleanup.py` - Service for removing privacy-sensitive user data while preserving research insights
- **Console System**: Real-time debug streaming via WebSocket (`modules/console.py`)
- **LLM Integration**: Uses vLLM server for Meta Llama model inference
- **Handlers**: Modular handlers for embeddings, literature search, LLM, and Obsidian integration
- **PDF Management**: `modules/pdf_manager.py` - PDF file storage and operations
- **PDF Extraction**: `modules/pdf_fulltext_extractor.py` - PyMuPDF-based text extraction
- **Database Models**: Organized in `db/` directory with separate modules for notes, PDFs, research objects
- **WebSocket Manager**: Real-time notifications for queue status updates

### Key Data Flow
1. User selects notes and PDFs in Obsidian plugin and provides research interest
2. Frontend sends context with note/PDF IDs to FastAPI backend via authenticated API
3. Backend stores context using ID arrays and adds task to persistent frame generation queue
4. Strategic background worker loads selected notes and PDFs directly from database
5. Worker processes content through selected strategy (random sampling, thematic clustering, all content)
6. LLM generates frame using raw notes/PDFs as context, stores with content associations
7. WebSocket notifications update frontend in real-time about queue status and new frames
8. Frontend displays frames with pagination support

## PDF Management System

### PDF Upload and Storage
- **File Upload**: `modules/pdf_manager.py` handles PDF file uploads with validation
- **Storage Structure**: PDFs stored in `pdf_storage/users/{user_id}/` directories
- **File Validation**: 50MB size limit, PDF MIME type checking
- **Text Extraction**: `modules/pdf_fulltext_extractor.py` uses PyMuPDF for fulltext extraction
- **Database Integration**: PDF metadata stored in `pdfs` table, fulltext in `pdf_fulltext` table
- **Frontend Selection**: Enhanced vault PDF discovery and selection with metadata display

## Frame Generation Process (Direct Content Processing)

### 1. Context Processing & Storage
- User provides research interest and selects Obsidian notes and PDFs through frontend UI
- Backend stores context using ID arrays (`selected_note_ids`, `selected_pdf_ids`) in PostgreSQL via `db/context.py`
- Context repository handles UPSERT operations for user contexts with research interest text
- Strategic background worker (`modules/strategic_background_worker.py`) processes tasks every 5 seconds

### 2. Direct Content Processing Pipeline
- **Content Processor** (`modules/content_processor.py`): Prepares notes and PDFs for direct frame generation
- **Content Processing Flow**:
  - Loads selected notes directly from database
  - Extracts PDF fulltext via `PDFFulltextExtractor` as needed
  - Validates content availability and quality
  - Passes raw content directly to strategies without intermediate extraction

### 3. Strategic Frame Generation
- **Strategy System**: Multiple frame generation strategies in `strategies/` directory
  - `BaseFrameStrategy` abstract class with common prompt creation and response parsing methods
  - `RandomSamplingStrategy`, `ThematicClusteringStrategy`, and `AllContentStrategy` concrete implementations
  - Strategy selection via `get_strategy()` from task configuration
- **Frame Generation Context**: Rich context object including user_id, research_interest, notes, pdfs, pdf_contents, strategy_params
- **LLM Integration**: Uses raw notes and PDF content directly as structured context

### 4. Enhanced Frame Storage & Metadata
- **Content Linking**: Frames associated with specific notes and PDFs used in generation
- **Generation Metadata**: Tracks strategy name, generation time, content IDs used
- **Database Schema**: Enhanced frames table with content associations via `notes_used` and `pdfs_used` arrays
- **Direct Generation**: No intermediate extraction step - content processed on-demand during frame generation

### 5. Database Architecture
- **Notes Table**: Stores Obsidian note content with file paths, linked PDF references, UPSERT on (user_id, file_path)
- **PDFs Table**: Stores PDF metadata with extraction status, pages processed, word count
- **Frames Table**: Enhanced with `notes_used` and `pdfs_used` arrays instead of research object references
- **PDF Fulltext Table**: Separate table for extracted PDF text with word counts and processing stats
- **Enhanced Context Table**: Uses PostgreSQL arrays for selected_note_ids and selected_pdf_ids

## Frontend Components (Detailed)

### View Hierarchy
- **AsyncResearchView** (`src/components/AsyncResearchView.tsx`): Root component with error boundary
- **BackendStatus** (`src/components/BackendStatus.tsx`): Checks backend connectivity on startup
- **LoginView** (`src/components/views/LoginView.tsx`): Handles authentication with signup/login options
- **SetupView** (`src/components/views/SetupView.tsx`): Research context configuration with PDF selection
- **FrameBrowserView** (`src/components/views/FrameBrowserView.tsx`): Main frames interface with enhanced controls
- **Direct Generation**: No research objects browser needed - frames generated directly from selected content

### Enhanced UI Features

**FrameBrowserView**:
- **Real-time Status**: Shows total frames, new frames, background worker status via WebSocket
- **Queue Monitoring**: Live queue status with position tracking, estimated wait times, and multi-user awareness
- **Search & Filter**: Full-text search across frame titles and perspectives
- **Sort Options**: Newest/oldest first sorting
- **Frame Cards**: Expandable preview cards with full modal details
- **Pagination**: Backend pagination with 5 frames per page for performance
- **Progress Console**: Integrated real-time extraction progress monitoring

**Simplified UI**:
- **Direct Generation**: No research objects management needed
- **Content Selection**: Select notes and PDFs directly in SetupView
- **Immediate Generation**: Frames generated on-demand from selected content
- **Streamlined Experience**: Reduced complexity with direct note/PDF to frame pipeline

### FrameCard Component (`src/components/cards/FrameCard.tsx`)
- **Compact View**: Shows title, perspective preview with basic stats
- **Expanded View**: Collapsible content preview with read more/less functionality
- **Full Modal**: Complete perspective content with markdown rendering
- **Visual Indicators**: New frame badges, color-coded generation time, accent colors per frame
- **Actions**: Mark as viewed, delete frame functionality

### SetupView Features
- **Research Interest**: Multi-line textarea for research context
- **File Selection**: Enhanced file selector for Obsidian vault notes
- **PDF Management**: Vault PDF selection with automatic detection
- **Previous Context**: Load and restore previous research sessions
- **Real-time Validation**: Shows unsaved changes, requires minimum 5 chars + files
- **Status Display**: Current context summary with file counts and timestamps
- **Extraction Controls**: Configure extractor type and parameters

### State Management
- **Zustand Store** (`src/store/frameStore.ts`): Global state for frames, user context, pagination
- **Authentication State**: Token management, login status
- **Frame Management**: CRUD operations, viewing status, pagination with 5 frames per page
- **WebSocket Integration**: Real-time queue status updates and frame refresh callbacks
- **Error Handling**: Centralized error display with dismissible alerts
- **Pagination State**: Current page, frames per page, total frame count
- **Simplified State**: No research objects state management needed

## Real-Time Progress Monitoring

### ProgressConsole Component
- **WebSocket Streaming**: Real-time debug output from extractors and strategies
- **Progress Tracking**: Visual progress bars with percentage completion
- **Log Levels**: INFO, DEBUG, WARNING, ERROR, CRITICAL message types
- **Console Export**: Download complete console logs as text files
- **Auto-scroll**: Automatically scrolls to latest messages when user is near bottom
- **Locked Mode**: Prevents closing during active operations
- **Message Filtering**: Filter by log level and module
- **Collapsible Messages**: Long messages (>1000 words) automatically collapse with "Show More" buttons
- **LLM-Focused Logging**: Simplified output focusing on time-consuming LLM operations

### Console Backend Integration
- **Console Handler Architecture**: Separation of concerns between business logic and logging
  - `extractors/console_handlers/` - Dedicated console handlers for each extractor type
  - `console_handler_base.py` - Base class with shared functionality and NoOp pattern
  - `console_handler_llm_extractor.py` - LLM-specific console handler with simplified output
- **WebSocketLogHandler**: Custom logging handler streaming to frontend
- **Real-time Streaming**: Direct WebSocket message delivery without queuing
- **Multi-user Support**: Isolated console sessions per user
- **File Logging**: Dual logging to files and WebSocket streams
- **Session Management**: Console setup/cleanup with WebSocket lifecycle
- **Simplified LLM Logging**: Focus on LLM generation steps with complete prompt/response display

### LLM Extractor Console Flow
- **Step 1**: Input parsing - Simple progress message
- **Step 2**: Content preparation - Progress per PDF processed
- **Step 3**: PDF Summary LLM calls - Complete SYSTEM + USER prompt and full LLM response
- **Step 4**: Content combination - Simple progress message
- **Step 5**: Research Objects LLM call - Complete prompt with all content and full structured response
- **Completion**: Final summary with object count

### Development Setup
The system requires:
- Node.js environment for frontend development
- Python conda environment 'knowledge-gap-finder' for backend
- PostgreSQL database (via Docker) with research objects, notes, and PDFs tables
- vLLM server for LLM inference with Meta Llama models
- tmux for managing multiple service sessions
- PyMuPDF (fitz) for PDF text extraction
- asyncpg for PostgreSQL async operations
- Advanced LLM-based extraction framework
- Real-time console streaming dependencies

## Real-Time Communication System

### WebSocket Architecture
- **WebSocket Manager** (`obsidian_plugin_backend/main.py:WebSocketManager`): Manages per-user WebSocket connections
- **Queue Notifications**: Real-time updates for task status changes (added, processing, completed, failed)
- **Frontend Integration**: `src/api.ts:AsyncResearchApi.connectWebSocket()` handles connection management
- **Automatic Reconnection**: Frontend automatically reconnects on connection loss

### Queue Management System
- **Persistent Queue** (`modules/frame_queue.py:FrameGenerationQueue`): Pickle-based task persistence across server restarts
- **Task States**: PENDING → PROCESSING → COMPLETED/FAILED with timestamps
- **Multi-User Support**: Concurrent processing with position tracking and estimated wait times
- **Queue Status**: Real-time position updates, estimated wait times, and multi-user queue awareness
- **Task Cleanup**: Automatic removal of old completed/failed tasks

## Pagination System

### Backend Pagination
- **API Endpoints**: `/frames?limit=5&offset=0` for efficient database queries
- **Response Structure**: Returns `frames`, `total_count`, and `new_frames_count`
- **Performance**: Loads only current page data to handle large frame collections

### Frontend Pagination
- **Store Management**: Zustand store tracks `currentPage`, `framesPerPage` (5), `totalFrameCount`
- **UI Controls**: Previous/Next buttons with page indicators
- **State Synchronization**: Page changes trigger new API calls for fresh data
- **Search Integration**: Client-side filtering works with paginated results

## API Enhancement Details

### New Authentication System
- **Signup/Login Separation**: Distinct signup and login endpoints with clear error messaging
- **Session Management**: JWT-based session tokens with automatic renewal
- **User Registration**: New user account creation with validation
- **Error Handling**: Detailed error messages for authentication failures

### Enhanced API Endpoints
- **Direct Frame Generation**: Frame generation directly from notes and PDFs without intermediate extraction
- **PDF Management**: Vault PDF discovery, upload, and fulltext extraction
- **Real-time Progress**: WebSocket-based progress streaming for long operations
- **Strategy Selection**: Multiple frame generation strategies with custom parameters
- **Simplified API**: Removed complex research objects CRUD operations

### Key Integration Points
- `src/api.ts:AsyncResearchApi` - Enhanced API client with simplified interface
- `main.tsx:ResearchFramesView` - Main UI view registration with improved error handling
- `obsidian_plugin_backend/main.py` - Complete FastAPI server with WebSocket support
- `modules/strategic_background_worker.py` - Direct content-based frame generation with console integration
- `modules/content_processor.py` - Simple content preparation for frame generation
- `modules/frame_queue.py` - Persistent task queue with real-time status updates
- `modules/console.py` - Real-time debug streaming system
- `strategies/` - Multiple frame generation strategies (RandomSampling, ThematicClustering, AllContent) working directly with notes/PDFs
- `db/notes.py` and `db/pdfs.py` - Enhanced content repositories with metadata
- `db/context.py` - User context storage with array-based selections
- `modules/pdf_fulltext_extractor.py` - Advanced PDF text extraction with progress tracking
- `src/store/frameStore.ts` - Enhanced state management with simplified views
- `src/components/ProgressConsole.tsx` - Real-time progress monitoring UI
- `db/connection.py` - Database connection pooling with enhanced schema support