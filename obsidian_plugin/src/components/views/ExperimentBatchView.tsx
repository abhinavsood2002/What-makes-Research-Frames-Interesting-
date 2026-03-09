// src/components/views/ExperimentBatchView.tsx
import React, { useState, useEffect } from 'react';
import {
  VStack,
  HStack,
  Box,
  Text,
  Button,
  Textarea,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Checkbox,
  CheckboxGroup,
  Progress,
  Alert,
  AlertIcon,
  useToast,
  Card,
  CardBody,
  Heading,
  Divider,
  Badge,
  SimpleGrid
} from '@chakra-ui/react';
import { useApp } from '../../contexts/AppContext';

export const ExperimentBatchView: React.FC = () => {
  const { api } = useApp();
  const toast = useToast();

  // Form state
  const [questions, setQuestions] = useState<string>('');
  const [repetitionsPerStrategy, setRepetitionsPerStrategy] = useState<number>(1);
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>([]);
  const [availableStrategies, setAvailableStrategies] = useState<Record<string, any>>({});

  // Batch generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [batchResult, setBatchResult] = useState<any>(null);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });

  // Load available strategies on component mount
  useEffect(() => {
    const loadStrategies = async () => {
      try {
        const response = await api.getAvailableStrategies();
        setAvailableStrategies(response.strategies);
        // Default to all strategies selected
        setSelectedStrategies(Object.keys(response.strategies));
      } catch (error: any) {
        console.warn('Could not load strategies:', error);
        // Set default fallback
        const fallbackStrategies = {
          'direct_answer': { name: 'direct_answer', display_name: 'Direct Answer (No Content)' },
          'all_content': { name: 'all_content', display_name: 'All Content Analysis' },
          'dorsts_frame': { name: 'dorsts_frame', display_name: 'Dorst\'s Frame Creation Process' }
        };
        setAvailableStrategies(fallbackStrategies);
        setSelectedStrategies(Object.keys(fallbackStrategies));
      }
    };

    loadStrategies();
  }, [api]);

  // Parse questions from textarea
  const parseQuestions = (text: string): string[] => {
    return text
      .split('\n')
      .map(q => q.trim())
      .filter(q => q.length > 0);
  };

  // Calculate total frames that will be generated
  const calculateTotalFrames = (): number => {
    const questionsList = parseQuestions(questions);
    return questionsList.length * selectedStrategies.length * repetitionsPerStrategy;
  };

  // Validate form inputs
  const isFormValid = (): boolean => {
    const questionsList = parseQuestions(questions);
    return questionsList.length > 0 &&
           selectedStrategies.length > 0 &&
           repetitionsPerStrategy >= 1;
  };

  // Handle batch generation
  const handleStartBatchGeneration = async () => {
    if (!isFormValid()) {
      toast({
        title: 'Invalid input',
        description: 'Please provide at least one question and select at least one strategy.',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    setIsGenerating(true);
    setBatchResult(null);
    setProgress({ completed: 0, total: 0 });

    try {
      const questionsList = parseQuestions(questions);
      const result = await api.triggerExperimentBatchGeneration(
        questionsList,
        repetitionsPerStrategy,
        selectedStrategies
      );

      setBatchResult(result);
      setProgress({ completed: 0, total: result.total_tasks });

      toast({
        title: 'Batch generation started!',
        description: `Generating ${result.total_tasks} frames across ${questionsList.length} questions`,
        status: 'success',
        duration: 5000,
        isClosable: true,
      });

      // Note: In a real implementation, you'd want to set up WebSocket listening
      // to track progress in real-time and update the progress state

    } catch (error: any) {
      toast({
        title: 'Error starting batch generation',
        description: error.message,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Reset form
  const handleReset = () => {
    setQuestions('');
    setRepetitionsPerStrategy(1);
    setSelectedStrategies(Object.keys(availableStrategies));
    setBatchResult(null);
    setProgress({ completed: 0, total: 0 });
  };

  const questionsList = parseQuestions(questions);
  const totalFrames = calculateTotalFrames();

  return (
    <VStack spacing={6} align="stretch" maxW="800px" mx="auto" p={4}>
      <Box>
        <Heading size="lg" mb={2}>Experiment Batch Generation</Heading>
        <Text color="obsidian.text.muted">
          Generate multiple frames for experimental comparison and ranking.
        </Text>
      </Box>

      <Card variant="outline">
        <CardBody>
          <VStack spacing={6} align="stretch">
            {/* Research Questions Input */}
            <Box>
              <Text fontWeight="semibold" mb={2}>
                Research Questions
              </Text>
              <Text fontSize="sm" color="obsidian.text.muted" mb={3}>
                Enter one research question per line. Each question will be used to generate frames with each selected strategy.
              </Text>
              <Textarea
                value={questions}
                onChange={(e) => setQuestions(e.target.value)}
                placeholder="Enter research questions, one per line:&#10;&#10;How can AI improve educational outcomes?&#10;What are the ethical implications of autonomous vehicles?&#10;How does climate change affect urban planning?"
                rows={6}
                resize="vertical"
              />
              {questionsList.length > 0 && (
                <Text fontSize="sm" color="obsidian.text.accent" mt={2}>
                  {questionsList.length} question{questionsList.length !== 1 ? 's' : ''} entered
                </Text>
              )}
            </Box>

            <Divider />

            {/* Strategy Selection */}
            <Box>
              <Text fontWeight="semibold" mb={2}>
                Frame Generation Strategies
              </Text>
              <Text fontSize="sm" color="obsidian.text.muted" mb={3}>
                Select which strategies to use for generating frames. Each question will be processed with each selected strategy.
              </Text>
              <CheckboxGroup
                value={selectedStrategies}
                onChange={(values) => setSelectedStrategies(values as string[])}
              >
                <VStack align="start" spacing={2}>
                  {Object.entries(availableStrategies).map(([key, strategy]) => (
                    <Checkbox key={key} value={key}>
                      <Box>
                        <Text>{strategy.display_name || key}</Text>
                        <Text fontSize="xs" color="obsidian.text.muted">
                          Strategy: {key}
                        </Text>
                      </Box>
                    </Checkbox>
                  ))}
                </VStack>
              </CheckboxGroup>
            </Box>

            <Divider />

            {/* Repetitions Setting */}
            <Box>
              <Text fontWeight="semibold" mb={2}>
                Repetitions per Strategy
              </Text>
              <Text fontSize="sm" color="obsidian.text.muted" mb={3}>
                Number of times to generate frames for each question-strategy combination. Higher repetitions provide more data for comparison.
              </Text>
              <NumberInput
                value={repetitionsPerStrategy}
                onChange={(_, value) => setRepetitionsPerStrategy(value || 1)}
                min={1}
                max={10}
                maxW="120px"
              >
                <NumberInputField />
                <NumberInputStepper>
                  <NumberIncrementStepper />
                  <NumberDecrementStepper />
                </NumberInputStepper>
              </NumberInput>
            </Box>

            <Divider />

            {/* Generation Summary */}
            <Box bg="obsidian.ui.background" p={4} borderRadius="md">
              <Text fontWeight="semibold" mb={2}>Generation Summary</Text>
              <SimpleGrid columns={2} spacing={4}>
                <Box>
                  <Text fontSize="sm" color="obsidian.text.muted">Questions:</Text>
                  <Text fontWeight="semibold">{questionsList.length}</Text>
                </Box>
                <Box>
                  <Text fontSize="sm" color="obsidian.text.muted">Strategies:</Text>
                  <Text fontWeight="semibold">{selectedStrategies.length}</Text>
                </Box>
                <Box>
                  <Text fontSize="sm" color="obsidian.text.muted">Repetitions:</Text>
                  <Text fontWeight="semibold">{repetitionsPerStrategy}</Text>
                </Box>
                <Box>
                  <Text fontSize="sm" color="obsidian.text.muted">Total Frames:</Text>
                  <Text fontWeight="semibold" color="blue.400">{totalFrames}</Text>
                </Box>
              </SimpleGrid>
            </Box>

            {/* Action Buttons */}
            <HStack spacing={3}>
              <Button
                colorScheme="blue"
                onClick={handleStartBatchGeneration}
                isDisabled={!isFormValid() || isGenerating}
                isLoading={isGenerating}
                loadingText="Starting batch..."
                flex={1}
              >
                Generate {totalFrames} Frames
              </Button>
              <Button
                variant="outline"
                onClick={handleReset}
                isDisabled={isGenerating}
              >
                Reset
              </Button>
            </HStack>
          </VStack>
        </CardBody>
      </Card>

      {/* Batch Generation Results */}
      {batchResult && (
        <Card variant="outline">
          <CardBody>
            <VStack spacing={4} align="stretch">
              <HStack justify="space-between" align="center">
                <Heading size="md">Batch Generation Status</Heading>
                <Badge colorScheme="green" variant="solid">
                  {batchResult.total_tasks} Tasks Queued
                </Badge>
              </HStack>

              {/* Progress Bar (placeholder - would be updated via WebSocket) */}
              <Box>
                <HStack justify="space-between" mb={2}>
                  <Text fontSize="sm">Progress</Text>
                  <Text fontSize="sm" color="obsidian.text.muted">
                    {progress.completed} of {progress.total} frames generated
                  </Text>
                </HStack>
                <Progress
                  value={progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}
                  colorScheme="blue"
                />
              </Box>

              <Alert status="info" borderRadius="md">
                <AlertIcon />
                <Box>
                  <Text fontSize="sm">
                    Your batch generation is in progress. Frames will appear in the Frame Browser as they're generated.
                    You can use the Frame Ranking system to compare all generated frames once complete.
                  </Text>
                </Box>
              </Alert>

              {/* Batch Details */}
              <Box>
                <Text fontWeight="semibold" mb={2}>Batch Details</Text>
                <SimpleGrid columns={2} spacing={4} fontSize="sm">
                  <Box>
                    <Text color="obsidian.text.muted">Questions:</Text>
                    <VStack align="start" spacing={1} mt={1}>
                      {batchResult.questions.map((q: string, i: number) => (
                        <Text key={i} fontSize="xs">{i + 1}. {q}</Text>
                      ))}
                    </VStack>
                  </Box>
                  <Box>
                    <Text color="obsidian.text.muted">Strategies:</Text>
                    <VStack align="start" spacing={1} mt={1}>
                      {batchResult.strategies.map((s: string) => (
                        <Text key={s} fontSize="xs">
                          {availableStrategies[s]?.display_name || s}
                        </Text>
                      ))}
                    </VStack>
                  </Box>
                </SimpleGrid>
              </Box>
            </VStack>
          </CardBody>
        </Card>
      )}
    </VStack>
  );
};