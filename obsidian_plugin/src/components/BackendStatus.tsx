import React, { useState, useEffect } from 'react';
import {
  VStack,
  HStack,
  Text,
  Button,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Badge,
  Card,
  CardBody,
  Spinner,
  Icon,
  Container,
} from '@chakra-ui/react';
import { RepeatIcon, CheckIcon, WarningIcon } from '@chakra-ui/icons';
import { useApp } from '../contexts/AppContext';

interface BackendHealth {
  status: 'healthy' | 'unhealthy';
  model_server?: 'connected' | 'disconnected';
  database?: 'connected' | 'disconnected';
  background_worker?: 'running' | 'stopped';
  error?: string;
}

interface BackendStatusProps {
  onStatusChange: (isOnline: boolean) => void;
}

export const BackendStatus: React.FC<BackendStatusProps> = ({ onStatusChange }) => {
  const { api } = useApp();
  const [status, setStatus] = useState<BackendHealth | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const checkBackendStatus = async () => {
    setIsChecking(true);
    try {
      const healthData = await api.healthCheck();
      setStatus(healthData);
      setLastChecked(new Date());
      onStatusChange(healthData.status === 'healthy');
    } catch (error: any) {
      setStatus({
        status: 'unhealthy',
        error: error.message || 'Failed to connect to backend'
      });
      setLastChecked(new Date());
      onStatusChange(false);
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    checkBackendStatus(); // Only check once on mount
  }, []);

  // Show loading state initially
  if (!status && !isChecking) {
    return (
      <Container maxW="4xl" py={6}>
        <VStack spacing={6} align="stretch">
          <Alert
            status="info"
            variant="subtle"
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            textAlign="center"
            minH="120px"
          >
            <Spinner size="xl" mb={4} />
            <AlertTitle mt={4} mb={1} fontSize="lg">
              Checking Backend Status...
            </AlertTitle>
            <AlertDescription maxWidth="sm">
              Connecting to the research frames backend service.
            </AlertDescription>
          </Alert>
        </VStack>
      </Container>
    );
  }

  const isHealthy = status?.status === 'healthy';

  return (
    <Container maxW="4xl" py={6}>
      <VStack spacing={6} align="stretch">
        <Alert
          status={isHealthy ? 'success' : 'error'}
          variant="subtle"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          textAlign="center"
          minH="160px"
        >
          <AlertIcon boxSize="40px" mr={0} />
          <AlertTitle mt={4} mb={1} fontSize="lg">
            {isHealthy ? 'Backend Connected' : 'Backend Offline'}
          </AlertTitle>
          <AlertDescription maxWidth="sm" mb={4}>
            {isHealthy
              ? 'Research Frames backend is running and ready.'
              : status?.error || 'Unable to connect to the research frames backend service.'
            }
          </AlertDescription>
          {!isHealthy && (
            <Button
              colorScheme="blue"
              size="lg"
              onClick={checkBackendStatus}
              isLoading={isChecking}
              loadingText="Retrying..."
              leftIcon={<RepeatIcon />}
            >
              Retry Connection
            </Button>
          )}
        </Alert>

        {status && (
          <Card variant="outline">
            <CardBody>
              <VStack spacing={4} align="stretch">
                <HStack justify="space-between" align="center">
                  <Text fontWeight="semibold" color="obsidian.text.normal">
                    Service Status
                  </Text>
                  {lastChecked && (
                    <Text fontSize="sm" color="obsidian.text.muted">
                      Last checked: {lastChecked.toLocaleTimeString()}
                    </Text>
                  )}
                </HStack>

                {isHealthy && (
                  <VStack spacing={3} align="stretch">
                    <HStack justify="space-between">
                      <Text fontSize="sm">Model Server:</Text>
                      <HStack>
                        <Icon
                          as={status.model_server === 'connected' ? CheckIcon : WarningIcon}
                          color={status.model_server === 'connected' ? 'green.500' : 'orange.500'}
                          boxSize={3}
                        />
                        <Badge
                          colorScheme={status.model_server === 'connected' ? 'green' : 'orange'}
                          size="sm"
                        >
                          {status.model_server}
                        </Badge>
                      </HStack>
                    </HStack>

                    <HStack justify="space-between">
                      <Text fontSize="sm">Database:</Text>
                      <HStack>
                        <Icon
                          as={status.database === 'connected' ? CheckIcon : WarningIcon}
                          color={status.database === 'connected' ? 'green.500' : 'orange.500'}
                          boxSize={3}
                        />
                        <Badge
                          colorScheme={status.database === 'connected' ? 'green' : 'orange'}
                          size="sm"
                        >
                          {status.database}
                        </Badge>
                      </HStack>
                    </HStack>

                    <HStack justify="space-between">
                      <Text fontSize="sm">Background Worker:</Text>
                      <HStack>
                        <Icon
                          as={status.background_worker === 'running' ? CheckIcon : WarningIcon}
                          color={status.background_worker === 'running' ? 'green.500' : 'orange.500'}
                          boxSize={3}
                        />
                        <Badge
                          colorScheme={status.background_worker === 'running' ? 'green' : 'orange'}
                          size="sm"
                        >
                          {status.background_worker}
                        </Badge>
                      </HStack>
                    </HStack>
                  </VStack>
                )}

                {!isHealthy && (
                  <Text fontSize="sm" color="obsidian.text.muted">
                    Make sure your backend server is running and accessible at the configured URL.
                  </Text>
                )}
              </VStack>
            </CardBody>
          </Card>
        )}
      </VStack>
    </Container>
  );
};