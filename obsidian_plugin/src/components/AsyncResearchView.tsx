// src/components/AsyncResearchView.tsx
import React, { useEffect, useState, useCallback } from 'react';
import {
  Box,
  Alert,
  AlertIcon,
  AlertDescription,
  CloseButton,
  Button,
  Flex,
  useToast,
  useDisclosure,
} from '@chakra-ui/react';
import { ViewIcon, SettingsIcon, InfoIcon, RepeatIcon } from '@chakra-ui/icons';
import { useFrameStore, ViewMode } from '../store/frameStore';
import { useApp } from '../contexts/AppContext';
import { LoginView } from './views/LoginView';
import { SetupView } from './views/SetupView';
import { FrameBrowserView } from './views/FrameBrowserView';
import { ExperimentBatchView } from './views/ExperimentBatchView';
import { BackendStatus } from './BackendStatus';
import { ErrorBoundary } from './ErrorBoundary';
import { ChakraProvider } from './ChakraProvider';
import { ProgressConsole } from './ProgressConsole';

const AsyncResearchViewContent: React.FC = () => {
  const { api } = useApp();
  const toast = useToast();
  const { 
    isAuthenticated,
    currentView, 
    error, 
    setError, 
    setUserContext, 
    setGenerationStatus,
    setFrames,
    currentPage,
    setCurrentPage,
    hasUserContext,
    setCurrentView,
    logout
  } = useFrameStore();
  
  const [isBackendOnline, setIsBackendOnline] = useState<boolean | null>(null);
  
  
  // Progress console configuration
  const { isOpen: isConsoleOpen, onOpen: onConsoleOpen, onClose: onConsoleClose } = useDisclosure();
  const [isConsoleLocked, setIsConsoleLocked] = useState(false);
  const [consoleTitle] = useState("Progress Console");

  // Set up logout callback for when backend goes down
  useEffect(() => {
    api.setOnLogout(async () => {
      console.log('🔐 Session expired or backend down, logging out...');
      
      // Immediately clear the API token to prevent further requests
      api.settings.token = '';
      api.settings.username = '';
      api.settings.password = '';
      
      // Disconnect WebSocket
      api.disconnectWebSocket();
      
      // Try to call backend logout (but don't wait if it fails)
      try {
        await api.logout();
        console.log('✅ Backend session cleaned up');
      } catch (error) {
        console.warn('⚠️ Backend logout failed (expected if backend is down):', error);
      }
      
      // Clear frontend state
      logout();
      setError('Connection to server lost. Please log in again.');
    });
  }, [api, logout, setError]);

  // Load user context on mount (only when backend is online and authenticated)
  useEffect(() => {
    if (isBackendOnline !== true || !isAuthenticated) return;
    
    const loadUserContext = async () => {
      try {
        const context = await api.getUserContext();
        setUserContext(context);
        
        // If user has context, show frames view
        if (context.research_interest && context.selected_note_ids && context.selected_note_ids.length > 0) {
          setCurrentView(ViewMode.FRAMES);
        }
      } catch (error: any) {
        console.error('Error loading user context:', error);
      }
    };

    loadUserContext();
  }, [api, setUserContext, setCurrentView, isBackendOnline, isAuthenticated]);

  // Create stable WebSocket message handler
  const handleWebSocketMessage = useCallback(async (message: any) => {
      console.log('🔔 WebSocket message received:', message);
      
      // Handle progress messages (extraction/generation)
      if (message.type === 'progress') {
        if (message.step === 'extraction_complete' || message.step === 'extraction_error') {
          setIsConsoleLocked(false);
          if (message.step === 'extraction_complete') {
            
            toast({
              title: 'Extraction completed',
              description: message.message,
              status: 'success',
              duration: 5000,
              isClosable: true,
            });
          }
        }
        // Let ProgressConsole handle all progress messages
        return;
      }
      
      // Handle queue update messages
      const { event, data } = message;
      
      // Debug: Log queue status details
      if (data?.queue_status) {
        console.log('📊 Queue status details:', {
          pending: data.queue_status.pending,
          processing: data.queue_status.processing,
          pending_positions: data.queue_status.pending_positions,
          total_queue_length: data.queue_status.total_queue_length
        });
      }
      
      switch (event) {
        case 'connected':
          console.log('📡 WebSocket connected, initial queue status:', data.queue_status);
          setGenerationStatus(prev => ({
            ...(prev || {}),
            queue_status: data.queue_status || (prev?.queue_status),
            background_worker_status: data.background_worker_status || (prev?.background_worker_status) || 'idle',
            new_frames_available: prev?.new_frames_available || 0
          }));
          break;
        case 'task_added':
          console.log('➕ Task added to queue:', data);
          setGenerationStatus(prev => ({
            ...(prev || {}),
            queue_status: data.queue_status || (prev?.queue_status),
            background_worker_status: data.background_worker_status || (prev?.background_worker_status) || 'idle',
            new_frames_available: prev?.new_frames_available || 0
          }));
          break;
        case 'task_processing':
          console.log('⚡ Task processing started:', data);
          setGenerationStatus(prev => ({
            ...(prev || {}),
            queue_status: data.queue_status || (prev?.queue_status),
            background_worker_status: data.background_worker_status || (prev?.background_worker_status) || 'idle',
            new_frames_available: prev?.new_frames_available || 0
          }));
          break;
        case 'task_completed': {
          console.log('✅ Task completed:', data);
          setIsConsoleLocked(false);
          setGenerationStatus(prev => ({
            ...(prev || {}),
            queue_status: data.queue_status || (prev?.queue_status),
            background_worker_status: data.background_worker_status || (prev?.background_worker_status) || 'idle',
            new_frames_available: (prev?.new_frames_available || 0) + 1  // Increment new frames count
          }));
          
          toast({
            title: 'Frame generation completed',
            description: 'New research frame has been generated!',
            status: 'success',
            duration: 5000,
            isClosable: true,
          });
          
          // When queue becomes empty (no pending/processing), refresh frames
          const queueEmpty = data.queue_status?.pending === 0 && data.queue_status?.processing === 0;
          if (queueEmpty) {
            console.log('🔄 Queue empty, refreshing frames...');
            // Get all frames (or at least a reasonable amount) to avoid losing old frames
            // Go back to page 1 to see the newest frames
            api.getFrames(50, 0).then(response => {
              setFrames(response.frames, response.total_count, response.new_frames_count);
              // Reset to page 1 so user sees the newest frames
              if (currentPage !== 1) {
                setCurrentPage(1);
              }
              console.log(`✅ Frames refreshed: ${response.frames.length} frames loaded`);
            }).catch(error => {
              console.error('❌ Error refreshing frames:', error);
            });
          }
          break;
        }
        case 'task_failed':
          console.log('❌ Task failed:', data);
          console.error('Frame generation error:', data.error);
          setIsConsoleLocked(false);
          setGenerationStatus(prev => ({
            ...(prev || {}),
            queue_status: data.queue_status || (prev?.queue_status),
            background_worker_status: data.background_worker_status || (prev?.background_worker_status) || 'idle',
            new_frames_available: prev?.new_frames_available || 0
          }));
          
          toast({
            title: 'Frame generation failed',
            description: data.error || 'There was an error generating the research frame.',
            status: 'error',
            duration: 7000,
            isClosable: true,
          });
          break;
      }
  }, [setGenerationStatus, setFrames, setCurrentPage, currentPage, api, toast]);

  // WebSocket queue update handling only (connection now handled at login)
  useEffect(() => {
    if (isBackendOnline !== true || !isAuthenticated) return;

    // Register callback for queue updates (only once per auth session)
    api.onQueueUpdate(handleWebSocketMessage);

    // Cleanup on unmount or when auth changes
    return () => {
      api.offQueueUpdate();
    };
  }, [api, isBackendOnline, isAuthenticated]); // Removed handleWebSocketMessage to prevent re-registering

  // Cleanup WebSocket connection on component unmount
  useEffect(() => {
    return () => {
      api.disconnectWebSocket();
    };
  }, [api]);

  // Load initial generation status when backend comes online and authenticated
  useEffect(() => {
    if (isBackendOnline !== true || !isAuthenticated) return;
    
    const loadInitialStatus = async () => {
      try {
        const status = await api.getGenerationStatus();
        setGenerationStatus(status);
      } catch (error) {
        // Silently fail status loading
      }
    };

    // Load initial status only once
    loadInitialStatus();
  }, [api, setGenerationStatus, isBackendOnline, isAuthenticated]);



  // Action handlers



  const renderContent = () => {
    // Show backend status if offline or checking
    if (isBackendOnline === false || isBackendOnline === null) {
      return <BackendStatus onStatusChange={setIsBackendOnline} />;
    }
    
    // Show login if not authenticated
    if (!isAuthenticated) {
      return <LoginView />;
    }
    
    // Show main content when backend is online and authenticated
    switch (currentView) {
      case ViewMode.LOGIN:
        return <LoginView />;
      case ViewMode.SETUP:
        return <SetupView />;
      case ViewMode.FRAMES:
        return <FrameBrowserView />;
      case ViewMode.EXPERIMENT_BATCH:
        return <ExperimentBatchView />;
      default:
        return <SetupView />;
    }
  };

  return (
    <Box h="100vh" overflow="hidden" bg="obsidian.bg.primary">
      {/* Error Banner */}
      {error && (
        <Alert 
          status="error" 
          position="absolute" 
          top={0} 
          left={0} 
          right={0} 
          zIndex={10}
          borderRadius={0}
        >
          <AlertIcon />
          <AlertDescription flex="1">{error}</AlertDescription>
          <CloseButton onClick={() => setError(null)} />
        </Alert>
      )}

{/* Navigation Bar */}
{isAuthenticated && isBackendOnline && (
  <Box
    borderBottom="1px"
    borderColor="obsidian.border"
    bg="obsidian.bg.secondary"
    px={4}
    py={2}
  >
    <Flex
      flexWrap="wrap"
      align="center"
      justify="space-between"
      gap={2}
    >
      {/* Left Side: Navigation Buttons */}
      <Flex flexWrap="wrap" gap={2}>
        <Button
          leftIcon={<SettingsIcon />}
          variant={currentView === ViewMode.SETUP ? "solid" : "ghost"}
          size="sm"
          onClick={() => setCurrentView(ViewMode.SETUP)}
        >
          Setup
        </Button>

        <Button
          leftIcon={<ViewIcon />}
          variant={currentView === ViewMode.FRAMES ? "solid" : "ghost"}
          size="sm"
          onClick={() => setCurrentView(ViewMode.FRAMES)}
          isDisabled={!hasUserContext()}
        >
          Frames
        </Button>

        <Button
          leftIcon={<RepeatIcon />}
          variant={currentView === ViewMode.EXPERIMENT_BATCH ? "solid" : "ghost"}
          size="sm"
          onClick={() => setCurrentView(ViewMode.EXPERIMENT_BATCH)}
          isDisabled={!hasUserContext()}
        >
          Batch
        </Button>

        <Button
          leftIcon={<InfoIcon />}
          variant="ghost"
          size="sm"
          onClick={onConsoleOpen}
          title="View extraction and generation progress"
        >
          Console
        </Button>
      </Flex>

      {/* Right Side: Actions + Logout */}
      <Flex flexWrap="wrap" align="center" gap={2}>
        <Button
          variant="ghost"
          size="sm"
          onClick={logout}
          colorScheme="red"
        >
          Logout
        </Button>
      </Flex>
    </Flex>
  </Box>
)}


      {/* Main Content */}
      <Box
        h="100%"
        pt={error ? '48px' : 0}
        pb={isAuthenticated && isBackendOnline ? '50px' : 0}
        overflow="auto"
      >
        {renderContent()}
      </Box>

      
      {/* Progress Console */}
      <ProgressConsole
        isOpen={isConsoleOpen}
        onClose={onConsoleClose}
        onProgressMessage={(callback) => api.onQueueUpdate(callback)}
        offProgressMessage={(callbackId) => api.offQueueUpdate(callbackId)}
        title={consoleTitle}
        isLocked={isConsoleLocked}
      />
    </Box>
  );
};

export const AsyncResearchView: React.FC = () => {
  return (
    <ChakraProvider>
      <ErrorBoundary>
        <AsyncResearchViewContent />
      </ErrorBoundary>
    </ChakraProvider>
  );
};