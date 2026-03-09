// src/components/ErrorBoundary.tsx
import React from 'react';
import {
  Box,
  VStack,
  Text,
  Button,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Code,
  Collapse,
  useDisclosure,
} from '@chakra-ui/react';

interface ErrorBoundaryState {
    hasError: boolean;
    error?: Error;
    errorInfo?: React.ErrorInfo;
}

export class ErrorBoundary extends React.Component<
    { children: React.ReactNode },
    ErrorBoundaryState
> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('Research Frames Error:', error, errorInfo);
        this.setState({ errorInfo });
    }

    render() {
        if (this.state.hasError) {
            return <ErrorFallback error={this.state.error} errorInfo={this.state.errorInfo} onReset={() => this.setState({ hasError: false })} />;
        }

        return this.props.children;
    }
}

interface ErrorFallbackProps {
    error?: Error;
    errorInfo?: React.ErrorInfo;
    onReset: () => void;
}

const ErrorFallback: React.FC<ErrorFallbackProps> = ({ error, errorInfo, onReset }) => {
    const { isOpen, onToggle } = useDisclosure();

    return (
        <Box p={8} maxW="600px" mx="auto">
            <VStack spacing={6} align="stretch">
                <Alert status="error" borderRadius="md">
                    <AlertIcon />
                    <Box>
                        <AlertTitle>Something went wrong!</AlertTitle>
                        <AlertDescription>
                            The Research Frames view encountered an error. This might be due to a temporary issue.
                        </AlertDescription>
                    </Box>
                </Alert>

                <VStack spacing={4}>
                    <Text color="obsidian.text.muted" textAlign="center">
                        You can try refreshing the view or check the error details below.
                    </Text>

                    <Button 
                        variant="solid" 
                        onClick={onReset}
                        size="lg"
                    >
                        Try Again
                    </Button>

                    <Button 
                        variant="outline" 
                        size="sm"
                        onClick={onToggle}
                    >
                        {isOpen ? 'Hide' : 'Show'} Error Details
                    </Button>
                </VStack>

                <Collapse in={isOpen}>
                    <VStack spacing={4} align="stretch">
                        {error && (
                            <Box>
                                <Text fontSize="sm" fontWeight="semibold" mb={2} color="obsidian.text.normal">
                                    Error Message:
                                </Text>
                                <Code 
                                    display="block" 
                                    p={3} 
                                    borderRadius="md"
                                    bg="obsidian.bg.secondary"
                                    color="obsidian.modifier.error"
                                    fontSize="sm"
                                    overflowX="auto"
                                >
                                    {error.message}
                                </Code>
                            </Box>
                        )}

                        {error?.stack && (
                            <Box>
                                <Text fontSize="sm" fontWeight="semibold" mb={2} color="obsidian.text.normal">
                                    Stack Trace:
                                </Text>
                                <Code 
                                    display="block" 
                                    p={3} 
                                    borderRadius="md"
                                    bg="obsidian.bg.secondary"
                                    color="obsidian.text.muted"
                                    fontSize="xs"
                                    overflowX="auto"
                                    whiteSpace="pre-wrap"
                                >
                                    {error.stack}
                                </Code>
                            </Box>
                        )}
                    </VStack>
                </Collapse>
            </VStack>
        </Box>
    );
};