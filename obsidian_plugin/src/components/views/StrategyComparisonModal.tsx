// src/components/views/StrategyComparisonModal.tsx
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
  Spinner,
  Card,
  CardBody,
  Divider,
  Heading,
  Badge,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Alert,
  AlertIcon,
} from '@chakra-ui/react';
import { useApp } from '../../contexts/AppContext';
import { Frame } from '../../api';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { preprocessLatex } from '../../utils/latexUtils';

// Memoized frame content component
const MemoizedFrameContent = React.memo<{
  frame: Frame;
}>(({ frame }) => {
  const content = useMemo(() =>
    preprocessLatex(frame.perspective),
    [frame.perspective]
  );

  return (
    <Box fontSize="md" lineHeight="1.7">
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

interface StrategyComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const STRATEGIES = [
  { key: 'direct_answer', label: 'Direct Answer', color: 'blue' },
  { key: 'all_content', label: 'All Content', color: 'green' },
  { key: 'dorsts_frame', label: "Dorst's Frame", color: 'purple' },
];

export const StrategyComparisonModal: React.FC<StrategyComparisonModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { api } = useApp();
  const [selectedStrategyIndex, setSelectedStrategyIndex] = useState(0);
  const [frames, setFrames] = useState<Record<string, Frame[]>>({});
  const [isLoading, setIsLoading] = useState(false);

  const selectedStrategy = STRATEGIES[selectedStrategyIndex];

  // Load frames for selected strategy
  useEffect(() => {
    if (!isOpen || !selectedStrategy) return;

    const loadStrategyFrames = async () => {
      // Check if we already loaded frames for this strategy
      if (frames[selectedStrategy.key]) {
        return;
      }

      setIsLoading(true);
      try {
        // Fetch all frames for this strategy (no pagination limit)
        const response = await api.getFrames(1000, 0, selectedStrategy.key);
        setFrames(prev => ({
          ...prev,
          [selectedStrategy.key]: response.frames
        }));
      } catch (error) {
        console.error('Error loading strategy frames:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadStrategyFrames();
  }, [isOpen, selectedStrategy, api]);

  const currentFrames = frames[selectedStrategy?.key] || [];

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="full">
      <ModalOverlay />
      <ModalContent maxH="95vh" maxW="95vw" mx="auto" my="auto">
        <ModalHeader borderBottom="1px solid" borderColor="obsidian.modifier.border">
          <VStack align="stretch" spacing={3}>
            <Heading size="lg" color="obsidian.text.normal">
              Compare Frames by Strategy
            </Heading>
            <Text fontSize="md" color="obsidian.text.muted" fontWeight="normal">
              View and compare frames generated using different analysis approaches
            </Text>
          </VStack>
        </ModalHeader>
        <ModalCloseButton />

        <ModalBody overflowY="auto" p={0}>
          <Tabs
            index={selectedStrategyIndex}
            onChange={setSelectedStrategyIndex}
            variant="soft-rounded"
            colorScheme="blue"
            isLazy
          >
            <Box
              position="sticky"
              top={0}
              bg="obsidian.bg.primary"
              zIndex={1}
              borderBottom="1px solid"
              borderColor="obsidian.modifier.border"
              px={8}
              pt={4}
            >
              <TabList mb={4}>
                {STRATEGIES.map((strategy, index) => (
                  <Tab
                    key={strategy.key}
                    fontWeight="semibold"
                    _selected={{
                      bg: `${strategy.color}.500`,
                      color: 'white'
                    }}
                  >
                    <HStack spacing={2}>
                      <Text>{strategy.label}</Text>
                      {frames[strategy.key] && (
                        <Badge
                          colorScheme={strategy.color}
                          variant={selectedStrategyIndex === index ? "solid" : "subtle"}
                          bg={selectedStrategyIndex === index ? "whiteAlpha.300" : undefined}
                        >
                          {frames[strategy.key].length}
                        </Badge>
                      )}
                    </HStack>
                  </Tab>
                ))}
              </TabList>
            </Box>

            <TabPanels>
              {STRATEGIES.map((strategy) => (
                <TabPanel key={strategy.key} px={8} py={6}>
                  {isLoading ? (
                    <Box textAlign="center" py={12}>
                      <Spinner size="xl" color={`${strategy.color}.500`} thickness="4px" />
                      <Text mt={4} color="obsidian.text.muted" fontSize="lg">
                        Loading {strategy.label} frames...
                      </Text>
                    </Box>
                  ) : currentFrames.length === 0 ? (
                    <Alert status="info" borderRadius="md">
                      <AlertIcon />
                      <VStack align="start" spacing={1}>
                        <Text fontWeight="semibold">
                          No frames found for {strategy.label} strategy
                        </Text>
                        <Text fontSize="sm">
                          Generate some frames using this strategy to see them here.
                        </Text>
                      </VStack>
                    </Alert>
                  ) : (
                    <VStack spacing={8} align="stretch">
                      {/* Summary Header */}
                      <Box
                        bg="obsidian.bg.secondary"
                        p={4}
                        borderRadius="lg"
                        borderLeft="4px solid"
                        borderLeftColor={`${strategy.color}.500`}
                      >
                        <HStack justify="space-between">
                          <VStack align="start" spacing={1}>
                            <Text fontSize="lg" fontWeight="bold" color="obsidian.text.normal">
                              {strategy.label} Strategy
                            </Text>
                            <Text fontSize="sm" color="obsidian.text.muted">
                              {currentFrames.length} frame{currentFrames.length !== 1 ? 's' : ''} generated
                            </Text>
                          </VStack>
                          <Badge
                            colorScheme={strategy.color}
                            fontSize="md"
                            px={4}
                            py={2}
                            variant="solid"
                          >
                            {currentFrames.length}
                          </Badge>
                        </HStack>
                      </Box>

                      {/* Frame List */}
                      {currentFrames.map((frame, index) => (
                        <Card
                          key={frame.id}
                          variant="outline"
                          borderWidth="1px"
                          borderColor="obsidian.modifier.border"
                          bg="obsidian.bg.primary"
                          _hover={{
                            borderColor: `${strategy.color}.400`,
                            boxShadow: 'md'
                          }}
                          transition="all 0.2s ease"
                        >
                          <CardBody p={6}>
                            <VStack align="stretch" spacing={5}>
                              {/* Header */}
                              <Box>
                                <HStack justify="space-between" align="start" mb={3}>
                                  <HStack spacing={3}>
                                    <Badge
                                      colorScheme={strategy.color}
                                      variant="solid"
                                      fontSize="sm"
                                      px={3}
                                      py={1}
                                    >
                                      Frame #{frame.id}
                                    </Badge>
                                    {!frame.is_viewed && (
                                      <Badge colorScheme="green" variant="solid">
                                        NEW
                                      </Badge>
                                    )}
                                  </HStack>
                                  <Text fontSize="xs" color="obsidian.text.muted">
                                    {formatDate(frame.created_at)}
                                  </Text>
                                </HStack>

                                <Heading
                                  as="h3"
                                  size="md"
                                  color="obsidian.text.normal"
                                  lineHeight="1.4"
                                  mb={3}
                                >
                                  {frame.title}
                                </Heading>

                                <Box
                                  bg="obsidian.bg.secondary"
                                  p={3}
                                  borderRadius="md"
                                  borderLeft="3px solid"
                                  borderLeftColor="obsidian.text.accent"
                                  mb={4}
                                >
                                  <Text fontSize="xs" color="obsidian.text.muted" fontWeight="semibold" mb={1}>
                                    Research Question:
                                  </Text>
                                  <Text fontSize="sm" color="obsidian.text.normal" lineHeight="1.5" fontStyle="italic">
                                    {frame.research_question}
                                  </Text>
                                </Box>
                              </Box>

                              <Divider borderColor="obsidian.modifier.border" />

                              {/* Full Perspective - Always Expanded */}
                              <Box>
                                <HStack justify="space-between" align="center" mb={3}>
                                  <Text fontSize="md" fontWeight="semibold" color="obsidian.text.normal">
                                    Research Perspective
                                  </Text>
                                  <HStack spacing={2}>
                                    {frame.generation_time_minutes && (
                                      <Badge
                                        colorScheme={frame.generation_time_minutes < 2 ? 'green' : frame.generation_time_minutes < 5 ? 'yellow' : 'red'}
                                        variant="subtle"
                                        fontSize="xs"
                                      >
                                        {frame.generation_time_minutes.toFixed(1)}m
                                      </Badge>
                                    )}
                                  </HStack>
                                </HStack>
                                <Box
                                  bg="obsidian.bg.secondary"
                                  p={5}
                                  borderRadius="lg"
                                  className="frame-content"
                                  color="obsidian.text.normal"
                                >
                                  <MemoizedFrameContent frame={frame} />
                                </Box>
                              </Box>

                              {/* Content Sources */}
                              {((frame.notes_used?.length || 0) > 0 || (frame.pdfs_used?.length || 0) > 0) && (
                                <>
                                  <Divider borderColor="obsidian.modifier.border" />
                                  <Box>
                                    <Text fontSize="sm" fontWeight="semibold" color="obsidian.text.muted" mb={2}>
                                      Content Sources
                                    </Text>
                                    <HStack spacing={3}>
                                      {(frame.notes_used?.length || 0) > 0 && (
                                        <Badge colorScheme="blue" variant="outline" px={3} py={1}>
                                          {frame.notes_used.length} Note{frame.notes_used.length !== 1 ? 's' : ''}
                                        </Badge>
                                      )}
                                      {(frame.pdfs_used?.length || 0) > 0 && (
                                        <Badge colorScheme="red" variant="outline" px={3} py={1}>
                                          {frame.pdfs_used.length} PDF{frame.pdfs_used.length !== 1 ? 's' : ''}
                                        </Badge>
                                      )}
                                    </HStack>
                                  </Box>
                                </>
                              )}
                            </VStack>
                          </CardBody>
                        </Card>
                      ))}
                    </VStack>
                  )}
                </TabPanel>
              ))}
            </TabPanels>
          </Tabs>
        </ModalBody>

        <ModalFooter borderTop="1px solid" borderColor="obsidian.modifier.border">
          <Button colorScheme="blue" onClick={onClose}>
            Close
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
