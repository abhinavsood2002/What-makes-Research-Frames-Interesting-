// src/components/views/FrameRankingView.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  VStack,
  HStack,
  Box,
  Text,
  Button,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useToast,
  Progress,
  Badge,
  Card,
  CardBody,
  Spinner,
  Grid,
  GridItem,
  Divider,
  Heading,
  IconButton,
  Tooltip,
} from '@chakra-ui/react';
import { CopyIcon } from '@chakra-ui/icons';
import { useApp } from '../../contexts/AppContext';
import { Frame, RankingPairingsResponse, FrameRanking } from '../../api';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { preprocessLatex } from '../../utils/latexUtils';

// Memoized frame content component to prevent unnecessary re-renders
const MemoizedFrameContent = React.memo<{
  frame: Frame;
  showFullContent?: boolean;
}>(({ frame, showFullContent = true }) => {
  const content = useMemo(() =>
    preprocessLatex(frame.perspective),
    [frame.perspective]
  );

  return (
    <Box fontSize="md" lineHeight="1.6">
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[rehypeKatex]}
      >
        {content}
      </ReactMarkdown>
    </Box>
  );
});

MemoizedFrameContent.displayName = 'MemoizedFrameContent';

interface FrameRankingViewProps {
  isOpen: boolean;
  onClose: () => void;
  frames: Frame[];
}

type RankingStage = 'categorization' | 'comparison' | 'results';

export const FrameRankingView: React.FC<FrameRankingViewProps> = ({
  isOpen,
  onClose,
  frames
}) => {
  const { api } = useApp();
  const toast = useToast();

  // State
  const [stage, setStage] = useState<RankingStage>('categorization');
  const [categories, setCategories] = useState<Record<number, string>>({});
  const [pairings, setPairings] = useState<number[][]>([]);
  const [currentPairIndex, setCurrentPairIndex] = useState(0);
  const [comparisons, setComparisons] = useState<Array<{winner: number, loser: number}>>([]);
  const [finalRankings, setFinalRankings] = useState<FrameRanking[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedFrames, setExpandedFrames] = useState<Set<number>>(new Set());
  const [categorizationFrames, setCategorizationFrames] = useState<Frame[]>([]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStage('categorization');
      setCategories({});
      setPairings([]);
      setCurrentPairIndex(0);
      setComparisons([]);
      setFinalRankings([]);
      setExpandedFrames(new Set());

      // Group frames by research_question (preserving question order from the array),
      // then shuffle within each group so strategy order is hidden from participants.
      const questionOrder: string[] = [];
      const grouped: Record<string, Frame[]> = {};
      for (const frame of frames) {
        if (!grouped[frame.research_question]) {
          questionOrder.push(frame.research_question);
          grouped[frame.research_question] = [];
        }
        grouped[frame.research_question].push(frame);
      }
      const shuffled = questionOrder.flatMap(q => {
        const group = [...grouped[q]];
        for (let i = group.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [group[i], group[j]] = [group[j], group[i]];
        }
        return group;
      });
      setCategorizationFrames(shuffled);
    }
  }, [isOpen]);

  // Function to toggle frame expansion
  const toggleFrameExpansion = (frameId: number) => {
    const newExpanded = new Set(expandedFrames);
    if (newExpanded.has(frameId)) {
      newExpanded.delete(frameId);
    } else {
      newExpanded.add(frameId);
    }
    setExpandedFrames(newExpanded);
  };

  // Copy functions
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Stage 1: Categorization
  const handleCategorySelection = (frameId: number, category: string) => {
    setCategories(prev => ({
      ...prev,
      [frameId]: category
    }));
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'useless': return 'red';
      case 'interesting': return 'blue';
      default: return 'gray';
    }
  };

  const getCategoryDisplay = (category: string) => {
    switch (category) {
      case 'useless': return 'Useless';
      case 'interesting': return 'Interesting';
      default: return 'Not Categorized';
    }
  };

  const categorizedCount = Object.keys(categories).length;
  const totalFrames = frames.length;

  const handleSaveCategories = async () => {
    const interestingCount = Object.values(categories).filter(c => c === 'interesting').length;

    if (categorizedCount < totalFrames) {
      toast({
        title: 'Incomplete categorization',
        description: `Please categorize all ${totalFrames} frames before proceeding.`,
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    if (interestingCount !== 9) {
      toast({
        title: 'Invalid frame count',
        description: `You must select exactly 9 frames as "interesting" for pairwise ranking. Currently selected: ${interestingCount}.`,
        status: 'warning',
        duration: 5000,
        isClosable: true,
      });
      return;
    }

    setIsLoading(true);
    try {
      await api.categorizeFrames(categories);

      // Get ranking pairings
      const pairingsResponse: RankingPairingsResponse = await api.getRankingPairings();

      if (pairingsResponse.pairings.length === 0) {
        toast({
          title: 'No frames to rank',
          description: 'You need exactly 9 frames categorized as "interesting" for pairwise ranking.',
          status: 'warning',
          duration: 5000,
          isClosable: true,
        });
        setIsLoading(false);
        return;
      }

      setPairings(pairingsResponse.pairings);
      setStage('comparison');

      toast({
        title: 'Categories saved',
        description: `Starting ranking with ${pairingsResponse.total_comparisons} comparisons.`,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });

    } catch (error: any) {
      toast({
        title: 'Error saving categories',
        description: error.message,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Stage 2: 1v1 Comparisons
  const handleComparison = (winnerId: number, loserId: number) => {
    const newComparisons = [...comparisons, { winner: winnerId, loser: loserId }];
    setComparisons(newComparisons);

    if (currentPairIndex + 1 < pairings.length) {
      setCurrentPairIndex(currentPairIndex + 1);
    } else {
      // All comparisons done, move to results
      handleFinalizeRankings(newComparisons);
    }
  };

  const handleFinalizeRankings = async (finalComparisons: Array<{winner: number, loser: number}>) => {
    setIsLoading(true);
    try {
      const response = await api.submitFrameRankings(finalComparisons);
      setFinalRankings(response.rankings);
      setStage('results');

      toast({
        title: 'Rankings complete!',
        description: `Successfully ranked ${response.rankings.length} frames.`,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });

    } catch (error: any) {
      toast({
        title: 'Error finalizing rankings',
        description: error.message,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const currentPair = pairings[currentPairIndex];
  const frame1 = currentPair ? frames.find(f => f.id === currentPair[0]) : null;
  const frame2 = currentPair ? frames.find(f => f.id === currentPair[1]) : null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="full" closeOnOverlayClick={false}>
      <ModalOverlay />
      <ModalContent maxH="95vh" maxW="95vw" mx="auto" my="auto" bg="black" color="white">
        <ModalHeader bg="gray.900" borderBottom="1px solid" borderColor="gray.700">
          <VStack align="stretch" spacing={3}>
            <Heading size="lg" color="obsidian.text.normal">Frame Ranking System</Heading>
            <HStack spacing={6} justify="center">
              <Badge
                colorScheme={stage === 'categorization' ? 'blue' : 'gray'}
                variant={stage === 'categorization' ? 'solid' : 'outline'}
                fontSize="sm"
                px={4}
                py={2}
              >
                1. Categorization
              </Badge>
              <Badge
                colorScheme={stage === 'comparison' ? 'blue' : 'gray'}
                variant={stage === 'comparison' ? 'solid' : 'outline'}
                fontSize="sm"
                px={4}
                py={2}
              >
                2. 1v1 Comparisons
              </Badge>
              <Badge
                colorScheme={stage === 'results' ? 'green' : 'gray'}
                variant={stage === 'results' ? 'solid' : 'outline'}
                fontSize="sm"
                px={4}
                py={2}
              >
                3. Results
              </Badge>
            </HStack>
          </VStack>
        </ModalHeader>
        <ModalCloseButton />

        <ModalBody overflowY="auto" p={8}>
          {stage === 'categorization' && (
            <VStack spacing={8} align="stretch">
              <Box bg="gray.900" p={6} borderRadius="lg" textAlign="center" border="1px solid" borderColor="gray.700">
                <Heading size="md" color="obsidian.text.normal" mb={4}>
                  📋 Categorize Frames
                </Heading>
                <Text fontSize="lg" color="obsidian.text.muted" mb={4}>
                  Review each frame and categorize it as either useful or not for your research. Select exactly 9 frames as "interesting" for pairwise ranking.
                </Text>
                <Progress
                  value={(categorizedCount / totalFrames) * 100}
                  colorScheme="blue"
                  mb={3}
                  size="lg"
                  borderRadius="full"
                />
                <Text fontSize="md" color="obsidian.text.accent" fontWeight="medium">
                  {categorizedCount} of {totalFrames} frames categorized
                </Text>
                <Text fontSize="md" color={Object.values(categories).filter(c => c === 'interesting').length === 9 ? "green.400" : "yellow.400"} fontWeight="medium" mt={2}>
                  {Object.values(categories).filter(c => c === 'interesting').length} of 9 frames marked as "interesting"
                </Text>
              </Box>

              <Grid templateColumns="repeat(auto-fit, minmax(800px, 1fr))" gap={6}>
                {categorizationFrames.map((frame) => {
                  const category = categories[frame.id];
                  const isCategorized = !!category;

                  return (
                    <GridItem key={frame.id}>
                      <Card
                        variant="outline"
                        borderWidth={isCategorized ? "2px" : "1px"}
                        borderColor={
                          category === 'useless' ? 'red.400' :
                          category === 'interesting' ? 'blue.400' :
                          'obsidian.modifier.border'
                        }
                        bg={
                          category === 'useless' ? 'red.900' :
                          category === 'interesting' ? 'blue.900' :
                          'obsidian.bg.primary'
                        }
                        transition="all 0.3s ease"
                        _hover={{
                          transform: "translateY(-2px)",
                          boxShadow: "lg"
                        }}
                      >
                        <CardBody p={6}>
                          <VStack align="stretch" spacing={4}>
                            <Box>
                              <HStack justify="space-between" align="start" mb={3}>
                                <Heading size="sm" color="obsidian.text.normal" noOfLines={2} flex={1}>
                                  {frame.title}
                                </Heading>
                                {isCategorized && (
                                  <Badge
                                    colorScheme={getCategoryColor(category)}
                                    variant="solid"
                                    fontSize="sm"
                                    px={3}
                                    py={1}
                                  >
                                    {getCategoryDisplay(category)}
                                  </Badge>
                                )}
                              </HStack>
                              <Text fontSize="sm" color="obsidian.text.muted" mb={3} fontStyle="italic">
                                Q: {frame.research_question}
                              </Text>
                              <Box
                                maxH="350px"
                                overflowY="auto"
                                color="obsidian.text.normal"
                                border="1px solid"
                                borderColor="obsidian.modifier.border"
                                borderRadius="md"
                                p={4}
                                bg="obsidian.bg.primary"
                                className="frame-content"
                              >
                                <MemoizedFrameContent frame={frame} />
                              </Box>
                            </Box>

                            <VStack spacing={3}>
                              <HStack spacing={4} width="100%">
                                <Button
                                  size="lg"
                                  colorScheme="red"
                                  variant={categories[frame.id] === 'useless' ? 'solid' : 'outline'}
                                  onClick={() => handleCategorySelection(frame.id, 'useless')}
                                  flex={1}
                                  fontWeight="semibold"
                                  _hover={{
                                    transform: categories[frame.id] === 'useless' ? 'none' : 'translateY(-1px)',
                                    boxShadow: categories[frame.id] === 'useless' ? 'none' : 'md'
                                  }}
                                  isDisabled={categories[frame.id] === 'useless'}
                                >
                                  Useless
                                </Button>
                                <Button
                                  size="lg"
                                  colorScheme="blue"
                                  variant={categories[frame.id] === 'interesting' ? 'solid' : 'outline'}
                                  onClick={() => handleCategorySelection(frame.id, 'interesting')}
                                  flex={1}
                                  fontWeight="semibold"
                                  _hover={{
                                    transform: categories[frame.id] === 'interesting' ? 'none' : 'translateY(-1px)',
                                    boxShadow: categories[frame.id] === 'interesting' ? 'none' : 'md'
                                  }}
                                  isDisabled={categories[frame.id] === 'interesting'}
                                >
                                  Interesting
                                </Button>
                              </HStack>
                            </VStack>
                          </VStack>
                        </CardBody>
                      </Card>
                    </GridItem>
                  );
                })}
              </Grid>
            </VStack>
          )}

          {stage === 'comparison' && frame1 && frame2 && (
            <VStack spacing={8} align="stretch">
              <Box textAlign="center" bg="gray.900" p={6} borderRadius="lg" border="1px solid" borderColor="gray.700">
                <Heading size="md" mb={3} color="obsidian.text.normal">
                  Comparison {currentPairIndex + 1} of {pairings.length}
                </Heading>
                <Progress
                  value={((currentPairIndex) / pairings.length) * 100}
                  colorScheme="blue"
                  mb={4}
                  size="lg"
                  borderRadius="full"
                />
                <Text fontSize="lg" color="obsidian.text.accent" fontWeight="medium">
                  Choose the frame that better addresses the research question
                </Text>
              </Box>

              <HStack spacing={8} align="stretch" minH="600px">
                {/* Frame 1 */}
                <Card
                  flex={1}
                  variant="outline"
                  borderWidth="2px"
                  borderColor="gray.400"
                  bg="gray.800"
                  _hover={{
                    borderColor: 'gray.300',
                    transform: 'scale(1.02)',
                    boxShadow: 'xl'
                  }}
                  transition="all 0.3s ease"
                  position="relative"
                >
                  <CardBody p={6}>
                    <VStack align="stretch" spacing={4} h="full">
                      <Box>
                        <Badge colorScheme="gray" variant="solid" mb={2}>Option A</Badge>
                        <Heading size="md" color="obsidian.text.normal" mb={3} lineHeight="1.3">
                          {frame1.title}
                        </Heading>
                        <Text fontSize="sm" color="obsidian.text.muted" fontStyle="italic" mb={4}>
                          Q: {frame1.research_question}
                        </Text>
                      </Box>

                      <Divider borderColor="gray.600" />

                      <Box flex={1}>
                        <Box
                          maxH="350px"
                          overflowY="auto"
                          fontSize="sm"
                          color="obsidian.text.normal"
                          bg="obsidian.bg.primary"
                          border="1px solid"
                          borderColor="obsidian.modifier.border"
                          borderRadius="md"
                          p={4}
                          className="frame-content"
                        >
                          <MemoizedFrameContent frame={frame1} />
                        </Box>
                      </Box>

                      <Button
                        colorScheme="gray"
                        size="xl"
                        h="60px"
                        fontSize="lg"
                        fontWeight="bold"
                        onClick={() => handleComparison(frame1.id, frame2.id)}
                        bg="gray.600"
                        color="white"
                        _hover={{
                          bg: "gray.500",
                          transform: "translateY(-2px)",
                          boxShadow: "xl"
                        }}
                        _active={{
                          transform: "translateY(0)",
                          boxShadow: "lg"
                        }}
                      >
                        Choose This Frame
                      </Button>
                    </VStack>
                  </CardBody>
                </Card>

                {/* VS Divider */}
                <VStack justify="center" align="center" spacing={4}>
                  <Box
                    bg="obsidian.interactive.accent"
                    color="white"
                    borderRadius="full"
                    w="80px"
                    h="80px"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    boxShadow="lg"
                    fontSize="2xl"
                    fontWeight="bold"
                    border="4px solid white"
                  >
                    VS
                  </Box>
                  <Text fontSize="sm" color="obsidian.text.muted" textAlign="center" maxW="100px">
                    Compare carefully
                  </Text>
                </VStack>

                {/* Frame 2 */}
                <Card
                  flex={1}
                  variant="outline"
                  borderWidth="2px"
                  borderColor="gray.400"
                  bg="gray.800"
                  _hover={{
                    borderColor: 'gray.300',
                    transform: 'scale(1.02)',
                    boxShadow: 'xl'
                  }}
                  transition="all 0.3s ease"
                  position="relative"
                >
                  <CardBody p={6}>
                    <VStack align="stretch" spacing={4} h="full">
                      <Box>
                        <Badge colorScheme="gray" variant="solid" mb={2}>Option B</Badge>
                        <Heading size="md" color="obsidian.text.normal" mb={3} lineHeight="1.3">
                          {frame2.title}
                        </Heading>
                        <Text fontSize="sm" color="obsidian.text.muted" fontStyle="italic" mb={4}>
                          Q: {frame2.research_question}
                        </Text>
                      </Box>

                      <Divider borderColor="gray.600" />

                      <Box flex={1}>
                        <Box
                          maxH="350px"
                          overflowY="auto"
                          fontSize="sm"
                          color="obsidian.text.normal"
                          bg="obsidian.bg.primary"
                          border="1px solid"
                          borderColor="obsidian.modifier.border"
                          borderRadius="md"
                          p={4}
                          className="frame-content"
                        >
                          <MemoizedFrameContent frame={frame2} />
                        </Box>
                      </Box>

                      <Button
                        colorScheme="gray"
                        size="xl"
                        h="60px"
                        fontSize="lg"
                        fontWeight="bold"
                        onClick={() => handleComparison(frame2.id, frame1.id)}
                        bg="gray.600"
                        color="white"
                        _hover={{
                          bg: "gray.500",
                          transform: "translateY(-2px)",
                          boxShadow: "xl"
                        }}
                        _active={{
                          transform: "translateY(0)",
                          boxShadow: "lg"
                        }}
                      >
                        Choose This Frame
                      </Button>
                    </VStack>
                  </CardBody>
                </Card>
              </HStack>
            </VStack>
          )}

          {stage === 'results' && (
            <VStack spacing={8} align="stretch">
              <Box textAlign="center" bg="gray.900" p={6} borderRadius="lg" border="1px solid" borderColor="gray.700">
                <Heading size="lg" color="obsidian.text.normal" mb={3}>
                  🏆 Final Rankings
                </Heading>
                <Text fontSize="lg" color="obsidian.text.muted" mb={2}>
                  Your frames ranked by performance
                </Text>
                <Text fontSize="md" color="obsidian.text.accent">
                  Based on {comparisons.length} head-to-head comparisons
                </Text>
              </Box>

              <VStack spacing={4} align="stretch">
                {finalRankings
                  .sort((a, b) => a.rank_position - b.rank_position)
                  .map((ranking, index) => {
                    const frame = frames.find(f => f.id === ranking.frame_id);
                    if (!frame) return null;

                    const isTopThree = ranking.rank_position <= 3;
                    const isExpanded = expandedFrames.has(frame.id);
                    const rankColor =
                      ranking.rank_position === 1 ? 'yellow' :
                      ranking.rank_position === 2 ? 'gray' :
                      ranking.rank_position === 3 ? 'orange' : 'blue';

                    return (
                      <Card
                        key={ranking.frame_id}
                        variant="outline"
                        borderWidth={isTopThree ? "2px" : "1px"}
                        borderColor={isTopThree ? `${rankColor}.400` : "obsidian.modifier.border"}
                        bg={isTopThree ? `${rankColor}.900` : "obsidian.bg.primary"}
                        transition="all 0.3s ease"
                        _hover={{
                          transform: "translateY(-2px)",
                          boxShadow: "lg"
                        }}
                      >
                        <CardBody p={6}>
                          <VStack align="stretch" spacing={4}>
                            {/* Header Row */}
                            <HStack spacing={6} align="center">
                              <VStack spacing={2} align="center" minW="80px">
                                <Badge
                                  colorScheme={rankColor}
                                  variant="solid"
                                  fontSize="lg"
                                  px={4}
                                  py={2}
                                  borderRadius="full"
                                >
                                  #{ranking.rank_position}
                                </Badge>
                                {ranking.rank_position === 1 && (
                                  <Text fontSize="xs" color="yellow.600" fontWeight="bold">
                                    WINNER
                                  </Text>
                                )}
                              </VStack>

                              <Box flex={1}>
                                <Heading size="md" mb={2} color="obsidian.text.normal">
                                  {frame.title}
                                </Heading>
                                <Text fontSize="sm" color="obsidian.text.muted" mb={2} fontStyle="italic" noOfLines={isExpanded ? undefined : 1}>
                                  Q: {frame.research_question}
                                </Text>
                                <HStack spacing={2} mb={2}>
                                  {frame.strategy_name && (
                                    <Badge colorScheme="purple" variant="outline" fontSize="xs">
                                      Strategy: {frame.strategy_name}
                                    </Badge>
                                  )}
                                  {ranking.wins !== undefined && (
                                    <Badge
                                      colorScheme="green"
                                      variant="solid"
                                      fontSize="xs"
                                      px={2}
                                      py={1}
                                    >
                                      {ranking.wins} wins
                                    </Badge>
                                  )}
                                </HStack>
                                {!isExpanded && (
                                  <Text fontSize="sm" color="obsidian.text.muted" noOfLines={3}>
                                    {frame.perspective.slice(0, 150)}...
                                  </Text>
                                )}
                              </Box>

                              <HStack spacing={2}>
                                <Tooltip label="Copy research question" placement="top">
                                  <IconButton
                                    size="xs"
                                    variant="ghost"
                                    icon={<CopyIcon />}
                                    onClick={() => copyToClipboard(frame.research_question)}
                                    color="obsidian.text.muted"
                                    _hover={{ bg: "obsidian.modifier.hover", color: "obsidian.text.accent" }}
                                  />
                                </Tooltip>
                                <Tooltip label="Copy frame text" placement="top">
                                  <IconButton
                                    size="xs"
                                    variant="ghost"
                                    icon={<CopyIcon />}
                                    onClick={() => copyToClipboard(frame.perspective)}
                                    color="obsidian.text.muted"
                                    _hover={{ bg: "obsidian.modifier.hover", color: "obsidian.text.accent" }}
                                  />
                                </Tooltip>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => toggleFrameExpansion(frame.id)}
                                  color="obsidian.text.accent"
                                  _hover={{ bg: "obsidian.modifier.hover" }}
                                >
                                  {isExpanded ? "Collapse" : "Expand"}
                                </Button>
                              </HStack>
                            </HStack>

                            {/* Expandable Content */}
                            {isExpanded && (
                              <Box
                                mt={4}
                                p={4}
                                bg="obsidian.bg.primary"
                                borderRadius="md"
                                border="1px solid"
                                borderColor="obsidian.modifier.border"
                              >
                                <Heading size="sm" mb={3} color="obsidian.text.accent">
                                  Full Perspective
                                </Heading>
                                <Box
                                  maxH="400px"
                                  overflowY="auto"
                                  color="obsidian.text.normal"
                                  className="frame-content"
                                >
                                  <MemoizedFrameContent frame={frame} />
                                </Box>
                              </Box>
                            )}
                          </VStack>
                        </CardBody>
                      </Card>
                    );
                  })}
              </VStack>
            </VStack>
          )}

          {isLoading && (
            <Box textAlign="center" py={8}>
              <Spinner size="lg" color="blue.500" />
              <Text mt={4} color="obsidian.text.muted">
                Processing...
              </Text>
            </Box>
          )}
        </ModalBody>

        <ModalFooter>
          <HStack spacing={3}>
            <Button variant="ghost" onClick={onClose}>
              {stage === 'results' ? 'Close' : 'Cancel'}
            </Button>

            {stage === 'categorization' && (
              <Button
                colorScheme="blue"
                onClick={handleSaveCategories}
                isDisabled={categorizedCount < totalFrames || Object.values(categories).filter(c => c === 'interesting').length !== 9 || isLoading}
                isLoading={isLoading}
              >
                Start Ranking ({Object.values(categories).filter(c => c === 'interesting').length}/9 frames)
              </Button>
            )}
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};