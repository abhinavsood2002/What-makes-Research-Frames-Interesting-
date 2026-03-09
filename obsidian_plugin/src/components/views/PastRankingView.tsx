// src/components/views/PastRankingView.tsx
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
  Badge,
  Card,
  CardBody,
  Spinner,
  Divider,
  Heading,
  Collapse,
  useDisclosure,
  IconButton,
  Alert,
  AlertIcon,
  Tooltip,
} from '@chakra-ui/react';
import { ChevronDownIcon, ChevronUpIcon, CopyIcon } from '@chakra-ui/icons';
import { useApp } from '../../contexts/AppContext';
import { PastRankingResponse, PastRankingResult, RankingComparison } from '../../api';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { preprocessLatex } from '../../utils/latexUtils';

// Memoized frame content component to prevent unnecessary re-renders
const MemoizedFrameContent = React.memo<{
  frame: PastRankingResult['frame'];
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

interface PastRankingViewProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PastRankingView: React.FC<PastRankingViewProps> = ({
  isOpen,
  onClose
}) => {
  const { api } = useApp();
  const toast = useToast();
  const { isOpen: isHistoryOpen, onToggle: onHistoryToggle } = useDisclosure();

  // State
  const [rankingData, setRankingData] = useState<PastRankingResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedFrames, setExpandedFrames] = useState<Set<number>>(new Set());
  const [expandedComparisons, setExpandedComparisons] = useState<Set<number>>(new Set());

  // Load ranking data when modal opens
  useEffect(() => {
    if (isOpen) {
      loadRankingData();
    }
  }, [isOpen]);

  const loadRankingData = async () => {
    setIsLoading(true);
    try {
      const response = await api.getPastRankingResults();
      setRankingData(response);
    } catch (error: any) {
      toast({
        title: 'Error loading past rankings',
        description: error.message,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

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

  // Function to toggle comparison expansion
  const toggleComparisonExpansion = (index: number) => {
    const newExpanded = new Set(expandedComparisons);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedComparisons(newExpanded);
  };

  // Copy functions
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const getRankColor = (position: number) => {
    switch (position) {
      case 1: return 'yellow';
      case 2: return 'gray';
      case 3: return 'orange';
      default: return 'blue';
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading || !rankingData) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} size="full" closeOnOverlayClick={false}>
        <ModalOverlay />
        <ModalContent maxH="95vh" maxW="95vw" mx="auto" my="auto" bg="black" color="white">
          <ModalHeader bg="gray.900" borderBottom="1px solid" borderColor="gray.700">
            <Heading size="lg" color="obsidian.text.normal">Past Ranking Results</Heading>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody display="flex" alignItems="center" justifyContent="center" minH="400px">
            <VStack spacing={4}>
              <Spinner size="xl" color="blue.500" />
              <Text color="obsidian.text.muted">Loading past ranking results...</Text>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="full" closeOnOverlayClick={false}>
      <ModalOverlay />
      <ModalContent maxH="95vh" maxW="95vw" mx="auto" my="auto" bg="black" color="white">
        <ModalHeader bg="gray.900" borderBottom="1px solid" borderColor="gray.700">
          <VStack align="stretch" spacing={3}>
            <Heading size="lg" color="obsidian.text.normal">📊 Past Ranking Results</Heading>
            <Alert status="info" size="sm">
              <AlertIcon />
              <Text fontSize="sm">
                This is a readonly view of your completed ranking experiment results.
              </Text>
            </Alert>
          </VStack>
        </ModalHeader>
        <ModalCloseButton />

        <ModalBody overflowY="auto" p={8}>
          <VStack spacing={8} align="stretch">
            {/* Summary Header */}
            <Box bg="gray.900" p={6} borderRadius="lg" textAlign="center" border="1px solid" borderColor="gray.700">
              <Heading size="md" color="obsidian.text.normal" mb={4}>
                🏆 Ranking Summary
              </Heading>
              <HStack justify="center" spacing={8}>
                <Box textAlign="center">
                  <Text fontSize="2xl" fontWeight="bold" color="obsidian.text.accent">
                    {rankingData.total_frames}
                  </Text>
                  <Text fontSize="sm" color="obsidian.text.muted" textTransform="uppercase">
                    Frames Ranked
                  </Text>
                </Box>
                <Box textAlign="center">
                  <Text fontSize="2xl" fontWeight="bold" color="obsidian.text.accent">
                    {rankingData.total_comparisons}
                  </Text>
                  <Text fontSize="sm" color="obsidian.text.muted" textTransform="uppercase">
                    Comparisons Made
                  </Text>
                </Box>
                <Box textAlign="center">
                  <Text fontSize="2xl" fontWeight="bold" color="green.400">
                    ✓
                  </Text>
                  <Text fontSize="sm" color="obsidian.text.muted" textTransform="uppercase">
                    Completed
                  </Text>
                </Box>
              </HStack>
            </Box>

            {/* Final Rankings */}
            <VStack spacing={6} align="stretch">
              <Heading size="lg" color="obsidian.text.normal" textAlign="center">
                Final Rankings
              </Heading>

              {rankingData.rankings.map((ranking, index) => {
                const isTopThree = ranking.rank_position <= 3;
                const isExpanded = expandedFrames.has(ranking.frame.id);
                const rankColor = getRankColor(ranking.rank_position);

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
                              {ranking.frame.title}
                            </Heading>
                            <Text fontSize="sm" color="obsidian.text.muted" mb={2} fontStyle="italic" noOfLines={isExpanded ? undefined : 1}>
                              Q: {ranking.frame.research_question}
                            </Text>
                            <HStack spacing={2} mb={2}>
                              {ranking.frame.strategy_name && (
                                <Badge colorScheme="purple" variant="outline" fontSize="xs">
                                  Strategy: {ranking.frame.strategy_name}
                                </Badge>
                              )}
                              <Badge
                                colorScheme="green"
                                variant="solid"
                                fontSize="xs"
                                px={2}
                                py={1}
                              >
                                {ranking.wins} wins
                              </Badge>
                              {ranking.frame.created_at && (
                                <Badge colorScheme="gray" variant="outline" fontSize="xs">
                                  {formatDate(ranking.frame.created_at)}
                                </Badge>
                              )}
                            </HStack>
                            {!isExpanded && (
                              <Text fontSize="sm" color="obsidian.text.muted" noOfLines={3}>
                                {ranking.frame.perspective.slice(0, 150)}...
                              </Text>
                            )}
                          </Box>

                          <HStack spacing={2}>
                            <Tooltip label="Copy research question" placement="top">
                              <IconButton
                                size="xs"
                                variant="ghost"
                                icon={<CopyIcon />}
                                onClick={() => copyToClipboard(ranking.frame.research_question)}
                                color="obsidian.text.muted"
                                _hover={{ bg: "obsidian.modifier.hover", color: "obsidian.text.accent" }}
                              />
                            </Tooltip>
                            <Tooltip label="Copy frame text" placement="top">
                              <IconButton
                                size="xs"
                                variant="ghost"
                                icon={<CopyIcon />}
                                onClick={() => copyToClipboard(ranking.frame.perspective)}
                                color="obsidian.text.muted"
                                _hover={{ bg: "obsidian.modifier.hover", color: "obsidian.text.accent" }}
                              />
                            </Tooltip>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => toggleFrameExpansion(ranking.frame.id)}
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
                              <MemoizedFrameContent frame={ranking.frame} />
                            </Box>
                          </Box>
                        )}
                      </VStack>
                    </CardBody>
                  </Card>
                );
              })}
            </VStack>

            {/* Comparison History */}
            <Card variant="outline">
              <CardBody>
                <HStack justify="space-between" align="center" mb={4}>
                  <Heading size="md" color="obsidian.text.normal">
                    Comparison History ({rankingData.total_comparisons} decisions)
                  </Heading>
                  <IconButton
                    aria-label="Toggle comparison history"
                    icon={isHistoryOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
                    variant="ghost"
                    onClick={onHistoryToggle}
                    color="obsidian.text.accent"
                  />
                </HStack>

                <Collapse in={isHistoryOpen}>
                  <VStack spacing={3} align="stretch">
                    <Text fontSize="sm" color="obsidian.text.muted" mb={4}>
                      Chronological order of all pairwise comparisons made during the ranking process.
                    </Text>

                    {rankingData.comparisons.map((comparison, index) => (
                      <Card
                        key={index}
                        variant="outline"
                        size="sm"
                        bg="obsidian.bg.secondary"
                      >
                        <CardBody py={3}>
                          <HStack spacing={4} align="center">
                            <Badge colorScheme="blue" variant="outline" fontSize="xs">
                              #{index + 1}
                            </Badge>

                            <Box flex={1}>
                              <HStack spacing={2} align="center" fontSize="sm">
                                <Text color="obsidian.text.normal" noOfLines={1} maxW="200px">
                                  {comparison.frame_1_title}
                                </Text>
                                <Text color="obsidian.text.muted" fontWeight="bold">vs</Text>
                                <Text color="obsidian.text.normal" noOfLines={1} maxW="200px">
                                  {comparison.frame_2_title}
                                </Text>
                                <Text color="obsidian.text.muted">→</Text>
                                <Text
                                  color="green.400"
                                  fontWeight="bold"
                                  noOfLines={1}
                                  maxW="200px"
                                >
                                  {comparison.winner_title}
                                </Text>
                              </HStack>
                            </Box>

                            {comparison.created_at && (
                              <Text fontSize="xs" color="obsidian.text.muted" minW="120px" textAlign="right">
                                {formatDate(comparison.created_at)}
                              </Text>
                            )}
                          </HStack>
                        </CardBody>
                      </Card>
                    ))}
                  </VStack>
                </Collapse>
              </CardBody>
            </Card>
          </VStack>
        </ModalBody>

        <ModalFooter>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};