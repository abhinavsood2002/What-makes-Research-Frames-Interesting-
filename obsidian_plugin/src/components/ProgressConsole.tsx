import React, { useState, useEffect, useRef } from 'react';
import {
    Modal,
    ModalOverlay,
    ModalContent,
    ModalHeader,
    ModalFooter,
    ModalBody,
    ModalCloseButton,
    Box,
    Text,
    Button,
    VStack,
    HStack,
    Badge,
    useColorModeValue,
    Collapse
} from '@chakra-ui/react';
import { ChevronDownIcon, ChevronUpIcon } from '@chakra-ui/icons';

interface ProgressConsoleProps {
    isOpen: boolean;
    onClose: () => void;
    onProgressMessage: (callback: (message: any) => void) => string;
    offProgressMessage: (callbackId: string) => void;
    title?: string;
    isLocked?: boolean; // When true, dialog cannot be closed
}

interface ConsoleEntry {
    id: string;
    timestamp: number;
    step: string;
    message: string;
    metadata?: Record<string, any>;
}

interface CollapsibleMessageProps {
    message: string;
    maxWords?: number;
    isLLMGeneration?: boolean;
}

interface ExpandableSection {
    type: 'PROMPT' | 'OUTPUT';
    content: string;
}

const LLMGenerationMessage: React.FC<{ message: string }> = ({ message }) => {
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
    
    // Parse the message to extract expandable sections
    const parseMessage = (msg: string): { title: string; sections: ExpandableSection[] } => {
        const lines = msg.split('\n');
        const title = lines[0] || '';
        const sections: ExpandableSection[] = [];
        
        let currentSection: ExpandableSection | null = null;
        let currentContent: string[] = [];
        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            
            if (line.startsWith('[EXPAND:PROMPT]')) {
                if (currentSection) {
                    currentSection.content = currentContent.join('\n');
                    sections.push(currentSection);
                }
                currentSection = { type: 'PROMPT', content: '' };
                currentContent = [];
            } else if (line.startsWith('[EXPAND:OUTPUT]')) {
                if (currentSection) {
                    currentSection.content = currentContent.join('\n');
                    sections.push(currentSection);
                }
                currentSection = { type: 'OUTPUT', content: '' };
                currentContent = [];
            } else if (line.startsWith('[/EXPAND:')) {
                if (currentSection) {
                    currentSection.content = currentContent.join('\n');
                    sections.push(currentSection);
                }
                currentSection = null;
                currentContent = [];
            } else if (currentSection) {
                currentContent.push(line);
            }
        }
        
        // Add final section if exists
        if (currentSection) {
            currentSection.content = currentContent.join('\n');
            sections.push(currentSection);
        }
        
        return { title, sections };
    };
    
    const { title, sections } = parseMessage(message);
    
    const toggleSection = (sectionType: string) => {
        setExpandedSections(prev => {
            const newSet = new Set(prev);
            if (newSet.has(sectionType)) {
                newSet.delete(sectionType);
            } else {
                newSet.add(sectionType);
            }
            return newSet;
        });
    };
    
    const getSectionIcon = (type: 'PROMPT' | 'OUTPUT') => {
        return type === 'PROMPT' ? '📝' : '🤖';
    };
    
    const getSectionColor = (type: 'PROMPT' | 'OUTPUT') => {
        return type === 'PROMPT' ? 'blue' : 'green';
    };
    
    return (
        <Box>
            <Text fontSize="sm" fontWeight="medium" mb={3}>
                {title}
            </Text>
            <VStack spacing={3} align="stretch">
                {sections.map((section, index) => {
                    const sectionKey = `${section.type}-${index}`;
                    const isExpanded = expandedSections.has(sectionKey);
                    const wordCount = section.content.split(/\s+/).length;
                    
                    return (
                        <Box key={sectionKey}>
                            <Button
                                size="sm"
                                variant="outline"
                                colorScheme={getSectionColor(section.type)}
                                leftIcon={isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
                                rightIcon={<Text fontSize="xs">{getSectionIcon(section.type)}</Text>}
                                onClick={() => toggleSection(sectionKey)}
                                w="full"
                                justifyContent="space-between"
                            >
                                <Text>
                                    {section.type} ({wordCount} words)
                                </Text>
                            </Button>
                            <Collapse in={isExpanded} animateOpacity>
                                <Box
                                    mt={2}
                                    p={3}
                                    bg="gray.50"
                                    borderRadius="md"
                                    border="1px solid"
                                    borderColor={`${getSectionColor(section.type)}.200`}
                                    maxH="400px"
                                    overflowY="auto"
                                >
                                    <Text 
                                        fontSize="sm" 
                                        fontFamily="mono"
                                        whiteSpace="pre-wrap"
                                        color="gray.800"
                                    >
                                        {section.content}
                                    </Text>
                                </Box>
                            </Collapse>
                        </Box>
                    );
                })}
            </VStack>
        </Box>
    );
};

const CollapsibleMessage: React.FC<CollapsibleMessageProps> = ({ 
    message, 
    maxWords = 1000,
    isLLMGeneration = false
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    
    // If this is an LLM generation message, use the specialized component
    if (isLLMGeneration) {
        return <LLMGenerationMessage message={message} />;
    }
    
    const words = message.split(/\s+/);
    const isLong = words.length > maxWords;
    
    if (!isLong) {
        return (
            <Text fontSize="sm" whiteSpace="pre-wrap">
                {message}
            </Text>
        );
    }
    
    const truncatedMessage = words.slice(0, maxWords).join(' ') + '...';
    
    return (
        <Box>
            <Collapse in={isExpanded} animateOpacity>
                <Text fontSize="sm" whiteSpace="pre-wrap">
                    {message}
                </Text>
            </Collapse>
            {!isExpanded && (
                <Text fontSize="sm" whiteSpace="pre-wrap">
                    {truncatedMessage}
                </Text>
            )}
            <Button
                size="xs"
                variant="link"
                colorScheme="blue"
                mt={2}
                leftIcon={isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                {isExpanded ? 'Show Less' : `Show More (${words.length - maxWords} more words)`}
            </Button>
        </Box>
    );
};

export const ProgressConsole: React.FC<ProgressConsoleProps> = ({
    isOpen,
    onClose,
    onProgressMessage,
    offProgressMessage,
    title = "Progress Console",
    isLocked = false
}) => {
    const [entries, setEntries] = useState<ConsoleEntry[]>([]);
    const [isActive, setIsActive] = useState(false);
    const [callbackId, setCallbackId] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    const bgColor = useColorModeValue('gray.50', 'gray.900');
    const entryBg = useColorModeValue('white', 'gray.800');
    const timestampColor = useColorModeValue('gray.500', 'gray.400');

    useEffect(() => {
        if (isOpen) {
            setIsActive(true);
            const id = onProgressMessage(handleProgressMessage);
            setCallbackId(id);
        } else {
            setIsActive(false);
            if (callbackId) {
                offProgressMessage(callbackId);
                setCallbackId(null);
            }
        }

        return () => {
            if (callbackId) {
                offProgressMessage(callbackId);
            }
        };
    }, [isOpen]);

    // Always autoscroll to bottom when console is active and entries change
    useEffect(() => {
        if (scrollRef.current && entries.length > 0 && isActive) {
            const scrollContainer = scrollRef.current;
            // Force scroll to bottom immediately
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }
    }, [entries, isActive]);

    const handleProgressMessage = (message: any) => {
        console.log('ProgressConsole received message:', message);
        
        if (message.type === 'progress' && message.step === 'debug_output') {
            // This is debug output from the extractor/strategy
            const newEntry: ConsoleEntry = {
                id: Math.random().toString(36).substr(2, 9),
                timestamp: Date.now(),
                step: message.metadata?.level || 'INFO',
                message: message.message,
                metadata: message.metadata
            };

            setEntries(prev => [...prev, newEntry]);
        } else if (message.type === 'progress' && (message.step === 'extraction_start' || message.step === 'extraction_complete' || message.step === 'extraction_error')) {
            // Handle extraction lifecycle events
            const newEntry: ConsoleEntry = {
                id: Math.random().toString(36).substr(2, 9),
                timestamp: Date.now(),
                step: message.step,
                message: message.message,
                metadata: message.metadata
            };

            setEntries(prev => [...prev, newEntry]);
            
            if (message.step === 'extraction_start') {
                // Clear console for new extraction run
                setEntries([]);
            }
        } else if (message.type === 'queue_update') {
            // Show queue updates for debugging WebSocket connection
            const newEntry: ConsoleEntry = {
                id: Math.random().toString(36).substr(2, 9),
                timestamp: Date.now(),
                step: 'queue_event',
                message: `Queue event: ${message.event}`,
                metadata: message.data
            };

            setEntries(prev => [...prev, newEntry]);
        }
    };

    const clearConsole = () => {
        setEntries([]);
    };

    const downloadConsole = () => {
        const consoleText = entries.map(entry => {
            const timestamp = new Date(entry.timestamp).toISOString();
            const metadata = entry.metadata ? ` [${JSON.stringify(entry.metadata)}]` : '';
            return `[${timestamp}] ${entry.step}: ${entry.message}${metadata}`;
        }).join('\n');

        const blob = new Blob([consoleText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `progress-console-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const formatTimestamp = (timestamp: number) => {
        return new Date(timestamp).toLocaleTimeString();
    };

    const getStepColor = (step: string) => {
        const stepColors: Record<string, string> = {
            'INFO': 'blue',
            'DEBUG': 'gray',
            'WARNING': 'orange',
            'ERROR': 'red',
            'CRITICAL': 'red',
            'queue_event': 'purple',
            'LLM_GENERATION': 'green'
        };
        return stepColors[step] || 'gray';
    };

    return (
        <Modal isOpen={isOpen} onClose={isLocked ? () => {} : onClose} size="6xl" closeOnOverlayClick={!isLocked}>
            <ModalOverlay />
            <ModalContent maxH="80vh">
                <ModalHeader>
                    <VStack spacing={3} align="stretch">
                        <HStack justify="space-between">
                            <Text>{title}</Text>
                            <HStack>
                                <Badge colorScheme={isActive ? 'green' : 'gray'}>
                                    {isActive ? 'Active' : 'Inactive'}
                                </Badge>
                                {isLocked && (
                                    <Badge colorScheme="orange">
                                        Locked
                                    </Badge>
                                )}
                            </HStack>
                        </HStack>
                    </VStack>
                </ModalHeader>
                {!isLocked && <ModalCloseButton />}

                <ModalBody>
                    <VStack spacing={4} align="stretch">
                        {!isLocked && (
                            <HStack justify="space-between">
                                <Text fontSize="sm" color={timestampColor}>
                                    {entries.length} entries
                                </Text>
                                <Button size="sm" onClick={clearConsole} variant="outline">
                                    Clear Console
                                </Button>
                            </HStack>
                        )}

                        <Box
                            ref={scrollRef}
                            bg={bgColor}
                            borderRadius="md"
                            border="1px solid"
                            borderColor="gray.200"
                            p={4}
                            h="60vh"
                            overflowY="auto"
                            fontFamily="mono"
                            fontSize="sm"
                        >
                            {entries.length === 0 ? (
                                <Text color={timestampColor} textAlign="center" mt={8}>
                                    No progress messages yet. Console will show activity during extraction and frame generation.
                                </Text>
                            ) : (
                                <VStack spacing={2} align="stretch">
                                    {entries.map(entry => (
                                        <Box
                                            key={entry.id}
                                            bg={entryBg}
                                            p={3}
                                            borderRadius="sm"
                                            borderLeft="4px solid"
                                            borderLeftColor={`${getStepColor(entry.step)}.500`}
                                        >
                                            <HStack justify="space-between" mb={1}>
                                                <Badge colorScheme={getStepColor(entry.step)} size="sm">
                                                    {entry.step}
                                                </Badge>
                                                <Text fontSize="xs" color={timestampColor}>
                                                    {formatTimestamp(entry.timestamp)}
                                                </Text>
                                            </HStack>
                                            <CollapsibleMessage 
                                                message={entry.message} 
                                                isLLMGeneration={entry.step === 'LLM_GENERATION'}
                                            />
                                            {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                                                <Box mt={2} fontSize="xs" color={timestampColor}>
                                                    <Text as="pre">
                                                        {JSON.stringify(entry.metadata, null, 2)}
                                                    </Text>
                                                </Box>
                                            )}
                                        </Box>
                                    ))}
                                </VStack>
                            )}
                        </Box>
                    </VStack>
                </ModalBody>

                <ModalFooter>
                    <VStack align="stretch" spacing={2} w="full">
                        <HStack justify="space-between" w="full">
                            <Text fontSize="xs" color={timestampColor}>
                                {isLocked ? 'Process is running...' : 'Always auto-scrolls to latest'}
                            </Text>
                            <Text fontSize="xs" color={timestampColor}>
                                {entries.length > 0 && `Last: ${formatTimestamp(entries[entries.length - 1].timestamp)}`}
                            </Text>
                        </HStack>
                    </VStack>
                    {!isLocked && (
                        <HStack>
                            <Button 
                                size="sm" 
                                onClick={downloadConsole}
                                colorScheme="blue"
                                variant="outline"
                                isDisabled={entries.length === 0}
                            >
                                Download Log
                            </Button>
                            <Button onClick={onClose}>Close</Button>
                        </HStack>
                    )}
                    {isLocked && (
                        <Button isDisabled>
                            Please wait...
                        </Button>
                    )}
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
};