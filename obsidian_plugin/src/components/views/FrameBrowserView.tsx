// src/components/views/FrameBrowserView.tsx
import React, { useEffect, useState, useMemo } from 'react';
import {
  VStack,
  Box,
  Text,
  Container,
  Button,
  HStack,
  useToast,
  Spinner,
  Flex,
  Alert,
  AlertIcon,
  Card,
  CardBody,
  Input,
  InputGroup,
  InputLeftElement,
  Select,
  Stack,
  Textarea,
  FormControl,
  FormLabel,
  FormHelperText,
  Badge,
} from '@chakra-ui/react';
import {
  AddIcon,
  RepeatIcon,
  SearchIcon,
  StarIcon,
  ViewIcon
} from '@chakra-ui/icons';
import { useFrameStore } from '../../store/frameStore';
import { useApp } from '../../contexts/AppContext';
import { FrameCard } from '../cards/FrameCard';
import { FrameRankingView } from './FrameRankingView';
import { PastRankingView } from './PastRankingView';
import { StrategyComparisonModal } from './StrategyComparisonModal';

export const FrameBrowserView: React.FC = () => {
  const { api } = useApp();
  const toast = useToast();
  const {
    frames,
    totalFrameCount,
    newFrameCount,
    generationStatus,
    currentPage,
    framesPerPage,
    userContext,
    isLoading,
    setFrames,
    setLoading,
    setError,
    setCurrentPage,
    getTotalPages,
    markFrameViewed,
    deleteFrame,
  } = useFrameStore();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedFrameId, setSelectedFrameId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [strategyFilter, setStrategyFilter] = useState<string>('all');
  const [selectedStrategy, setSelectedStrategy] = useState('direct_answer');
  const [researchQuestion, setResearchQuestion] = useState('');
  const [availableStrategies, setAvailableStrategies] = useState<Record<string, any>>({});
  const [isRankingModalOpen, setIsRankingModalOpen] = useState(false);
  const [isPastRankingModalOpen, setIsPastRankingModalOpen] = useState(false);
  const [isComparisonModalOpen, setIsComparisonModalOpen] = useState(false);
  const [allFrames, setAllFrames] = useState<any[]>([]);
  const [isExpandAllMode, setIsExpandAllMode] = useState(false);
  const [expandedFrameIds, setExpandedFrameIds] = useState<Set<number>>(new Set());

  const loadFrames = async () => {
    setLoading(true);
    try {
      const offset = (currentPage - 1) * framesPerPage;
      console.log('📊 Loading frames:', { framesPerPage, offset, currentPage, strategyFilter });

      const response = await api.getFrames(framesPerPage, offset, strategyFilter);

      console.log('📦 Backend response:', {
        framesReturned: response.frames.length,
        totalCount: response.total_count,
        newFramesCount: response.new_frames_count
      });

      setFrames(response.frames, response.total_count, response.new_frames_count);

      console.log('✅ Called setFrames with:', {
        framesLength: response.frames.length,
        totalCount: response.total_count,
        newFramesCount: response.new_frames_count
      });
    } catch (error: any) {
      setError(`Error loading frames: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const refreshFrames = async () => {
    setIsRefreshing(true);
    try {
      const response = await api.getFrames(framesPerPage, 0);
      setFrames(response.frames, response.total_count, response.new_frames_count);
      setCurrentPage(1);  // Explicitly reset to page 1 for refresh
      
      toast({
        title: 'Frames refreshed',
        description: `Loaded ${response.frames.length} frames`,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    } catch (error: any) {
      setError(`Error refreshing frames: ${error.message}`);
    } finally {
      setIsRefreshing(false);
    }
  };


  useEffect(() => {
    loadFrames();
  }, [currentPage, strategyFilter]);

  // Reset to first page when strategy filter changes
  useEffect(() => {
    if (currentPage !== 1) {
      setCurrentPage(1);
    }
  }, [strategyFilter]);

  useEffect(() => {
    // Load available strategies and extractors
    const loadStrategies = async () => {
      try {
        const response = await api.getAvailableStrategies();
        setAvailableStrategies(response.strategies);
        // Always use direct_answer as default, ignore backend default for now
        setSelectedStrategy('direct_answer');
      } catch (error: any) {
        console.warn('Could not load strategies:', error);
        // Set default fallback for question-focused frame generation
        setAvailableStrategies({
          'direct_answer': { name: 'direct_answer', display_name: 'Direct Answer (No Content)' },
          'all_content': { name: 'all_content', display_name: 'All Content Analysis' },
          'dorsts_frame': { name: 'dorsts_frame', display_name: 'Dorst\'s Frame Creation Process' }
        });
        setSelectedStrategy('direct_answer');
      }
    };

    
    loadStrategies();
  }, []);



  const triggerGeneration = async () => {
    if (!researchQuestion.trim()) {
      toast({
        title: 'Research question required',
        description: 'Please enter a research question before generating a frame',
        status: 'warning',
        duration: 5000,
        isClosable: true,
      });
      return;
    }

    try {
      await api.triggerFrameGeneration(selectedStrategy, researchQuestion.trim());
      toast({
        title: 'Frame generation triggered',
        description: `A new frame will be generated using ${availableStrategies[selectedStrategy]?.display_name || selectedStrategy} strategy`,
        status: 'success',
        duration: 5000,
        isClosable: true,
      });
    } catch (error: any) {
      toast({
        title: 'Generation failed',
        description: error.message,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  const handleFrameSelect = async (frameId: number) => {
    if (isExpandAllMode) {
      // In expand all mode, toggle individual frame in the expanded set
      const newExpandedIds = new Set(expandedFrameIds);
      if (newExpandedIds.has(frameId)) {
        newExpandedIds.delete(frameId);
      } else {
        newExpandedIds.add(frameId);
      }
      setExpandedFrameIds(newExpandedIds);

      // If no frames left expanded, exit expand all mode
      if (newExpandedIds.size === 0) {
        setIsExpandAllMode(false);
      }
    } else {
      // Normal single selection mode
      // Toggle selection - if already selected, deselect it
      if (selectedFrameId === frameId) {
        setSelectedFrameId(null);
        return;
      }

      setSelectedFrameId(frameId);
    }

    // Mark as viewed if not already viewed
    const frame = frames.find(f => f.id === frameId);
    if (frame && !frame.is_viewed) {
      try {
        await api.markFramesViewed([frameId]);
        markFrameViewed(frameId);
      } catch (error) {
        console.error('Error marking frame as viewed:', error);
      }
    }
  };

  const handleFrameDelete = async (frameId: number) => {
    try {
      await api.deleteFrame(frameId);
      deleteFrame(frameId);

      // If the deleted frame was selected, clear selection
      if (selectedFrameId === frameId) {
        setSelectedFrameId(null);
      }
    } catch (error: any) {
      throw new Error(error.message || 'Failed to delete frame');
    }
  };

  const handleOpenRanking = async () => {
    try {
      // Load all frames for ranking
      const response = await api.getAllFrames();
      setAllFrames(response.frames);
      setIsRankingModalOpen(true);
    } catch (error: any) {
      toast({
        title: 'Error loading frames',
        description: error.message,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  const handleRankingClose = () => {
    setIsRankingModalOpen(false);
    // Refresh frames to potentially show new rankings
    refreshFrames();
  };

  const handleOpenPastRanking = () => {
    setIsPastRankingModalOpen(true);
  };

  const handlePastRankingClose = () => {
    setIsPastRankingModalOpen(false);
  };

  const handleOpenComparison = () => {
    setIsComparisonModalOpen(true);
  };

  const handleComparisonClose = () => {
    setIsComparisonModalOpen(false);
  };

  // Expand All functionality
  const handleExpandAll = () => {
    if (isExpandAllMode) {
      // Collapse all - clear all states
      setIsExpandAllMode(false);
      setExpandedFrameIds(new Set());
      setSelectedFrameId(null);
    } else {
      // Expand all - add all current page frame IDs to expanded set
      setIsExpandAllMode(true);
      const currentPageFrameIds = new Set(displayFrames.map(frame => frame.id));
      setExpandedFrameIds(currentPageFrameIds);
      setSelectedFrameId(null); // Clear single selection
    }
  };

  // Apply client-side search and sort filtering (strategy filtering handled by backend)
  const filteredAndSortedFrames = useMemo(() => {
    let filteredFrames = frames;

    // Apply search filter (client-side for now)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filteredFrames = filteredFrames.filter(frame =>
        frame.title.toLowerCase().includes(query) ||
        frame.perspective?.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    const sortedFrames = [...filteredFrames].sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });

    return sortedFrames;
  }, [frames, searchQuery, sortOrder]);

  // Backend pagination - frames array already contains the current page's frames
  const displayFrames = frames;
  const totalPages = getTotalPages();

  if (isLoading && frames.length === 0) {
    return (
      <Container maxW="8xl" h="100%" display="flex" alignItems="center" justifyContent="center">
        <VStack spacing={4}>
          <Spinner 
            thickness="3px"
            speed="0.8s"
            emptyColor="obsidian.modifier.border"
            color="obsidian.interactive.accent"
            size="xl"
          />
          <Text color="obsidian.text.muted" fontSize="sm">
            Loading your research frames...
          </Text>
        </VStack>
      </Container>
    );
  }

  return (
    <Container maxW="8xl" h="100%" overflowY="auto" py={6}>
      <VStack spacing={6} align="stretch">
        {/* Header */}
        <Box>
          <VStack spacing={4} align="stretch" mb={4}>

            <Flex justify="space-between" align="center" wrap="wrap" gap={3}>
              {/* Navigation Buttons */}

              {/* Generation Controls */}
              <HStack spacing={2} flexWrap="wrap">
                <Button
                  leftIcon={<RepeatIcon />}
                  variant="outline"
                  size="sm"
                  onClick={refreshFrames}
                  isLoading={isRefreshing}
                >
                  Refresh
                </Button>
                {totalFrameCount >= 3 && (
                  <Button
                    leftIcon={<StarIcon />}
                    colorScheme="purple"
                    variant="outline"
                    size="sm"
                    onClick={handleOpenRanking}
                  >
                    Rank Frames
                  </Button>
                )}
                <Button
                  leftIcon={<ViewIcon />}
                  colorScheme="blue"
                  variant="outline"
                  size="sm"
                  onClick={handleOpenPastRanking}
                >
                  View Past Rankings
                </Button>
                {totalFrameCount > 0 && (
                  <Button
                    leftIcon={<ViewIcon />}
                    colorScheme="teal"
                    variant="outline"
                    size="sm"
                    onClick={handleOpenComparison}
                  >
                    Compare Strategies
                  </Button>
                )}
                <Select
                  value={selectedStrategy}
                  onChange={(e) => setSelectedStrategy(e.target.value)}
                  size="sm"
                  width="180px"
                  variant="outline"
                  flexShrink={0}
                >
                  {Object.entries(availableStrategies).map(([key, strategy]) => (
                    <option key={key} value={key}>
                      {strategy.display_name || key}
                    </option>
                  ))}
                </Select>
              </HStack>
            </Flex>
          </VStack>
        </Box>

        {/* Status Info */}
        <Card variant="glass">
          <CardBody py={4}>
            <Flex justify="space-between" align="center" wrap="wrap" gap={4}>
              <HStack spacing={8}>
                <Box textAlign="center">
                  <Text fontSize="xl" fontWeight="bold" color="obsidian.text.accent">
                    {totalFrameCount}
                  </Text>
                  <Text fontSize="xs" color="obsidian.text.muted" textTransform="uppercase" letterSpacing="wider">
                    Total
                  </Text>
                </Box>
                
                {newFrameCount > 0 && (
                  <Box textAlign="center">
                    <Text fontSize="xl" fontWeight="bold" color="obsidian.text.success">
                      {newFrameCount}
                    </Text>
                    <Text fontSize="xs" color="obsidian.text.muted" textTransform="uppercase" letterSpacing="wider">
                      New
                    </Text>
                  </Box>
                )}
                
                <Box textAlign="center">
                  <HStack spacing={2} justify="center">
                    {generationStatus?.background_worker_status === 'running' ? (
                      <>
                        <Spinner size="sm" color="obsidian.text.success" />
                        <Text fontSize="sm" fontWeight="medium" color="obsidian.text.success">Active</Text>
                      </>
                    ) : (
                      <Text fontSize="sm" color="obsidian.text.muted">Idle</Text>
                    )}
                  </HStack>
                  <Text fontSize="xs" color="obsidian.text.muted" textTransform="uppercase" letterSpacing="wider">
                    Generator
                  </Text>
                </Box>

                {/* User-Specific Queue Status */}
                {generationStatus?.queue_status && (generationStatus.queue_status.pending > 0 || generationStatus.queue_status.processing > 0) && (
                  <Box textAlign="center" maxW="250px">
                    <VStack spacing={1}>
                      {/* Show total user frames in queue (pending + processing) */}
                      <HStack spacing={2} justify="center">
                        <Text fontSize="sm" fontWeight="medium" color="obsidian.text.accent">
                          🔄 {generationStatus.queue_status.pending + generationStatus.queue_status.processing} frame{(generationStatus.queue_status.pending + generationStatus.queue_status.processing) > 1 ? 's' : ''} queued
                        </Text>
                      </HStack>
                      
                      {/* Show position info for pending frames */}
                      {generationStatus.queue_status.pending > 0 && generationStatus.queue_status.pending_positions.length > 0 && (
                        <Text fontSize="xs" color="obsidian.text.muted" textAlign="center">
                          Next position {Math.min(...generationStatus.queue_status.pending_positions)} in queue
                        </Text>
                      )}
                      
                      {/* Show estimated wait time */}
                      {generationStatus.queue_status.estimated_wait_time > 0 && (
                        <Text fontSize="xs" color="obsidian.text.accent" fontWeight="medium" textAlign="center">
                          ⏱️ ~{Math.ceil(generationStatus.queue_status.estimated_wait_time)}m wait
                        </Text>
                      )}
                      
                      {/* Show if there are other users in queue */}
                      {generationStatus.queue_status.total_queue_length > (generationStatus.queue_status.pending + generationStatus.queue_status.processing) && (
                        <Text fontSize="xs" color="obsidian.text.muted" opacity={0.7}>
                          {generationStatus.queue_status.total_queue_length - generationStatus.queue_status.pending - generationStatus.queue_status.processing} others in queue
                        </Text>
                      )}
                    </VStack>
                  </Box>
                )}
              </HStack>

              {userContext?.research_interest && (
                <Box maxW="md" textAlign="right">
                  <Text fontSize="xs" color="obsidian.text.muted" mb={1}>
                    Research Focus
                  </Text>
                  <Text fontSize="sm" fontWeight="medium" color="obsidian.text.normal" noOfLines={2}>
                    {userContext.research_interest}
                  </Text>
                </Box>
              )}
            </Flex>
          </CardBody>
        </Card>

        {/* Frame Generation Section */}
        <Card variant="elevated">
          <CardBody>
            <VStack spacing={4} align="stretch">
              <Box>
                <Text fontSize="lg" fontWeight="semibold" color="obsidian.text.normal" mb={2}>
                  Generate New Frame
                </Text>
                <Text fontSize="sm" color="obsidian.text.muted">
                  Ask a specific research question to generate an exploratory frame using your selected content and approach.
                </Text>
              </Box>

              {/* Research Question Input */}
              <FormControl>
                <FormLabel fontSize="sm" fontWeight="medium">Research Question</FormLabel>
                <Textarea
                  placeholder="What specific question would you like to explore? e.g., 'How do social media algorithms affect user behavior patterns?'"
                  value={researchQuestion}
                  onChange={(e) => setResearchQuestion(e.target.value)}
                  rows={3}
                  size="md"
                  resize="vertical"
                />
                <FormHelperText>
                  This question will guide the frame generation process and determine how your content is analyzed.
                </FormHelperText>
              </FormControl>

              {/* Strategy Selection */}
              <HStack spacing={4} align="end">
                <FormControl flex="1">
                  <FormLabel fontSize="sm" fontWeight="medium">Analysis Approach</FormLabel>
                  <Select
                    value={selectedStrategy}
                    onChange={(e) => setSelectedStrategy(e.target.value)}
                    size="md"
                  >
                    {Object.entries(availableStrategies).map(([key, strategy]) => (
                      <option key={key} value={key}>
                        {strategy.display_name || key}
                      </option>
                    ))}
                  </Select>
                </FormControl>

                <Button
                  colorScheme="blue"
                  size="md"
                  onClick={triggerGeneration}
                  isDisabled={!researchQuestion.trim() || !userContext?.research_interest}
                  minW="120px"
                >
                  Generate Frame
                </Button>
              </HStack>

              {/* Strategy Descriptions */}
              <Box fontSize="xs" color="obsidian.text.muted" bg="obsidian.bg.secondary" p={3} borderRadius="md">
                {selectedStrategy === 'direct_answer' && (
                  <Text><Badge colorScheme="blue" mr={2}>Direct Answer</Badge>
                  Provides analytical insights based on research expertise without using your specific content sources.</Text>
                )}
                {selectedStrategy === 'all_content' && (
                  <Text><Badge colorScheme="green" mr={2}>All Content</Badge>
                  Analyzes your research question using all selected notes and PDFs for comprehensive exploration.</Text>
                )}
                {selectedStrategy === 'dorsts_frame' && (
                  <Text><Badge colorScheme="purple" mr={2}>Dorst's Process</Badge>
                  Uses a 5-step design thinking approach: Archaeology, Paradox, Context, Frames, and Futures for deep reframing.</Text>
                )}
              </Box>

              {!userContext?.research_interest && (
                <Alert status="warning" size="sm">
                  <AlertIcon />
                  <Text fontSize="sm">
                    Please set up your research context in the Setup tab before generating frames.
                  </Text>
                </Alert>
              )}
            </VStack>
          </CardBody>
        </Card>

        {/* New Frames Alert */}
        {newFrameCount > 0 && (
          <Alert status="info" borderRadius="md">
            <AlertIcon />
            <Text>
              You have <strong>{newFrameCount}</strong> new frame{newFrameCount > 1 ? 's' : ''} generated! 
              Click on a frame to mark it as viewed.
            </Text>
          </Alert>
        )}

        {/* Search and Filter Controls */}
        <Card variant="outline">
          <CardBody py={4}>
            <Stack direction={{ base: 'column', md: 'row' }} spacing={3} align="stretch">
              <Box flex="1">
                <InputGroup size="md">
                  <InputLeftElement pointerEvents="none">
                    <SearchIcon color="obsidian.text.muted" boxSize={4} />
                  </InputLeftElement>
                  <Input
                    placeholder="Search across all frame content..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    borderRadius="lg"
                    _placeholder={{ color: 'obsidian.text.muted', fontSize: 'sm' }}
                  />
                </InputGroup>
              </Box>
              <Box minW="150px">
                <Select
                  value={strategyFilter}
                  onChange={(e) => setStrategyFilter(e.target.value)}
                  size="md"
                  borderRadius="lg"
                >
                  <option value="all">All Strategies</option>
                  <option value="direct_answer">Direct Answer</option>
                  <option value="all_content">All Content</option>
                  <option value="dorsts_frame">Dorst's Frame</option>
                </Select>
              </Box>
              <Box minW="130px">
                <Select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}
                  size="md"
                  borderRadius="lg"
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                </Select>
              </Box>
            </Stack>
            {(searchQuery || strategyFilter !== 'all') && (
              <Box mt={3} pt={2} borderTop="1px solid" borderColor="obsidian.modifier.border">
                <Text fontSize="sm" color="obsidian.text.muted">
                  <Text as="span" fontWeight="medium" color="obsidian.text.accent">
                    {filteredAndSortedFrames.length}
                  </Text>
                  {' '}frame{filteredAndSortedFrames.length !== 1 ? 's' : ''}
                  {searchQuery && strategyFilter !== 'all'
                    ? ` found with search "${searchQuery}" and strategy "${strategyFilter}"`
                    : searchQuery
                      ? ` found with search "${searchQuery}"`
                      : ` found with strategy "${strategyFilter}"`
                  }
                </Text>
              </Box>
            )}
          </CardBody>
        </Card>


        {/* Pagination Controls - ALWAYS ACTIVE */}
        <Card variant="outline">
          <CardBody py={3}>
            <Flex justify="space-between" align="center">
              <Text fontSize="sm" color="obsidian.text.muted">
                Showing {((currentPage - 1) * framesPerPage) + 1}-{Math.min(currentPage * framesPerPage, totalFrameCount)} of {totalFrameCount} frames
              </Text>
              <HStack spacing={4}>
                {/* Expand All Button */}
                {displayFrames.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    leftIcon={<ViewIcon />}
                    onClick={handleExpandAll}
                    color="obsidian.text.accent"
                    _hover={{ bg: "obsidian.modifier.hover" }}
                  >
                    {isExpandAllMode ? "Collapse All" : "Expand All"}
                  </Button>
                )}

                {/* Pagination Controls */}
                <HStack spacing={2}>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCurrentPage(currentPage - 1)}
                    isDisabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <Text fontSize="sm" color="obsidian.text.normal" px={2}>
                    Page {currentPage} of {totalPages || 1}
                  </Text>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCurrentPage(currentPage + 1)}
                    isDisabled={currentPage >= (totalPages || 1)}
                  >
                    Next
                  </Button>
                </HStack>
              </HStack>
            </Flex>
          </CardBody>
        </Card>

        {/* Frames List */}
        {displayFrames.length > 0 ? (
          <VStack spacing={6} align="stretch">
            {displayFrames.map((frame, index) => (
              <Box
                key={frame.id}
                opacity={0}
                animation={`fadeInUp 0.5s ease-out ${index * 0.1}s forwards`}
              >
                <FrameCard
                  frame={frame}
                  isSelected={selectedFrameId === frame.id || expandedFrameIds.has(frame.id)}
                  onSelect={() => handleFrameSelect(frame.id)}
                  onDelete={handleFrameDelete}
                />
              </Box>
            ))}
          </VStack>
        ) : (
          <Card variant="glass" minH="250px" display="flex" alignItems="center" justifyContent="center">
            <VStack spacing={5} textAlign="center">
              {(searchQuery || strategyFilter !== 'all') ? (
                <>
                  <Box>
                    <SearchIcon boxSize={8} color="obsidian.text.muted" mb={2} />
                    <Text fontSize="lg" fontWeight="medium" color="obsidian.text.normal" mb={1}>
                      No frames found
                    </Text>
                    <Text fontSize="sm" color="obsidian.text.muted" maxW="md">
                      {searchQuery && strategyFilter !== 'all'
                        ? `No frames match your search "${searchQuery}" with strategy "${strategyFilter}". Try different keywords or change filters.`
                        : searchQuery
                          ? `No frames match your search for "${searchQuery}". Try different keywords or clear the search.`
                          : `No frames found with strategy "${strategyFilter}". Try selecting a different strategy.`
                      }
                    </Text>
                  </Box>
                  <HStack>
                    {searchQuery && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSearchQuery('')}
                        borderRadius="lg"
                      >
                        Clear Search
                      </Button>
                    )}
                    {strategyFilter !== 'all' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setStrategyFilter('all')}
                        borderRadius="lg"
                      >
                        Clear Strategy Filter
                      </Button>
                    )}
                  </HStack>
                </>
              ) : frames.length === 0 ? (
                <>
                  <Box>
                    <AddIcon boxSize={8} color="obsidian.text.muted" mb={2} />
                    <Text fontSize="lg" fontWeight="medium" color="obsidian.text.normal" mb={1}>
                      No frames yet
                    </Text>
                    <Text fontSize="sm" color="obsidian.text.muted" maxW="md">
                      Frames are generated on-demand from your notes. Click Generate to create your first frame.
                    </Text>
                  </Box>
                  <Button
                    leftIcon={<AddIcon />}
                    variant="gradient"
                    onClick={triggerGeneration}
                    size="md"
                    borderRadius="lg"
                  >
                    Generate First Frame
                  </Button>
                </>
              ) : (
                <>
                  <Box>
                    <SearchIcon boxSize={8} color="obsidian.text.muted" mb={2} />
                    <Text fontSize="lg" fontWeight="medium" color="obsidian.text.normal" mb={1}>
                      No matches
                    </Text>
                    <Text fontSize="sm" color="obsidian.text.muted" maxW="md">
                      Try adjusting your search or sort settings.
                    </Text>
                  </Box>
                </>
              )}
            </VStack>
          </Card>
        )}

        {/* Frame Ranking Modal */}
        <FrameRankingView
          isOpen={isRankingModalOpen}
          onClose={handleRankingClose}
          frames={allFrames}
        />

        {/* Past Ranking Modal */}
        <PastRankingView
          isOpen={isPastRankingModalOpen}
          onClose={handlePastRankingClose}
        />

        {/* Strategy Comparison Modal */}
        <StrategyComparisonModal
          isOpen={isComparisonModalOpen}
          onClose={handleComparisonClose}
        />
      </VStack>
    </Container>
  );
};