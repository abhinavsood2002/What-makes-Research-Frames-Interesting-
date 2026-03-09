import React, { useState } from 'react';
import {
  VStack,
  Box,
  Heading,
  Text,
  Button,
  Card,
  CardBody,
  Input,
  FormControl,
  FormLabel,
  FormErrorMessage,
  Container,
  useToast,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  InputGroup,
  InputRightElement,
  IconButton,
  useColorModeValue,
} from '@chakra-ui/react';
import { keyframes } from '@emotion/react';
import { ViewIcon, ViewOffIcon, LockIcon } from '@chakra-ui/icons';
import { useFrameStore } from '../../store/frameStore';
import { useApp } from '../../contexts/AppContext';

// Simple animation keyframes
const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
`;

export const LoginView: React.FC = () => {
  const { api } = useApp();
  const { setAuthenticated, setError } = useFrameStore();
  const toast = useToast();

  // Form states
  const [loginForm, setLoginForm] = useState({
    username: '',
    password: '',
  });
  const [signupForm, setSignupForm] = useState({
    username: '',
    password: '',
    confirmPassword: '',
  });

  // UI states
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const validateLoginForm = () => {
    const errors: Record<string, string> = {};
    
    if (!loginForm.username.trim()) {
      errors.username = 'Username is required';
    }
    if (!loginForm.password) {
      errors.password = 'Password is required';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateSignupForm = () => {
    const errors: Record<string, string> = {};
    
    if (!signupForm.username.trim()) {
      errors.username = 'Username is required';
    } else if (signupForm.username.length < 3) {
      errors.username = 'Username must be at least 3 characters';
    }
    
    if (!signupForm.password) {
      errors.password = 'Password is required';
    } else if (signupForm.password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }
    
    if (signupForm.password !== signupForm.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleLogin = async () => {
    if (!validateLoginForm()) return;

    setIsLoggingIn(true);
    setFormErrors({});

    try {
      // Update API with credentials
      api.settings.username = loginForm.username;
      api.settings.password = loginForm.password;
      
      const response = await api.login();
      
      // First, ensure any existing connections are completely cleaned up
      api.disconnectWebSocket();
      
      // Clear any old settings
      api.settings.token = '';
      api.settings.username = '';
      api.settings.password = '';
      
      // Set new credentials
      api.settings.username = loginForm.username;
      api.settings.password = loginForm.password;
      api.updateAuthToken(response.session_token);
      
      setAuthenticated(response.session_token, loginForm.username);
      
      // Connect WebSocket after successful login (with delay to ensure cleanup is complete)
      setTimeout(() => {
        console.log('🔑 Connecting WebSocket with fresh token:', response.session_token.substring(0, 8) + '...');
        api.connectWebSocket();
      }, 200);
      
      toast({
        title: 'Login successful',
        description: `Welcome back, ${loginForm.username}!`,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    } catch (error: any) {
      setError(`Login failed: ${error.message}`);
      toast({
        title: 'Login failed',
        description: error.message,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSignup = async () => {
    if (!validateSignupForm()) return;

    setIsSigningUp(true);
    setFormErrors({});

    try {
      // Update API with credentials
      api.settings.username = signupForm.username;
      api.settings.password = signupForm.password;
      
      const response = await api.signup();
      
      // First, ensure any existing connections are completely cleaned up
      api.disconnectWebSocket();
      
      // Clear any old settings
      api.settings.token = '';
      api.settings.username = '';
      api.settings.password = '';
      
      // Set new credentials
      api.settings.username = signupForm.username;
      api.settings.password = signupForm.password;
      api.updateAuthToken(response.session_token);
      
      setAuthenticated(response.session_token, signupForm.username);
      
      // Connect WebSocket after successful signup (with delay to ensure cleanup is complete)
      setTimeout(() => {
        console.log('🔑 Connecting WebSocket with fresh token:', response.session_token.substring(0, 8) + '...');
        api.connectWebSocket();
      }, 200);
      
      toast({
        title: 'Account created successfully',
        description: `Welcome to Research Frames, ${signupForm.username}!`,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    } catch (error: any) {
      setError(`Signup failed: ${error.message}`);
      toast({
        title: 'Signup failed',
        description: error.message,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsSigningUp(false);
    }
  };

  return (
    <Container maxW="md" h="100vh" display="flex" alignItems="center" justifyContent="center">
      <Box w="full" animation={`${fadeIn} 0.6s ease-out`}>
        <VStack spacing={8} align="stretch">
          {/* Header */}
          <VStack spacing={4} textAlign="center">
            <Box 
              p={4} 
              bg={useColorModeValue("blue.500", "blue.600")}
              borderRadius="full"
            >
              <LockIcon boxSize={6} color="white" />
            </Box>
            <Box>
              <Heading 
                as="h1" 
                size="xl"
                color={useColorModeValue("gray.800", "white")}
                mb={2}
                fontWeight="semibold"
              >
                Research Frames
              </Heading>
              <Text 
                color={useColorModeValue("gray.600", "gray.400")} 
                fontSize="md"
              >
                Sign in to access your research workspace
              </Text>
            </Box>
          </VStack>

          {/* Login/Signup Forms */}
          <Card 
            variant="elevated" 
            size="lg"
            bg={useColorModeValue("white", "gray.800")}
            boxShadow="lg"
            borderRadius="lg"
          >
            <CardBody p={6}>
              <Tabs variant="enclosed" colorScheme="blue">
                <TabList mb={4}>
                  <Tab>Login</Tab>
                  <Tab>Sign Up</Tab>
                </TabList>

                <TabPanels>
                  {/* Login Panel */}
                  <TabPanel px={0} pt={6}>
                    <VStack spacing={4} align="stretch">
                      <FormControl isInvalid={!!formErrors.username}>
                        <FormLabel>Username</FormLabel>
                        <InputGroup>
                          <Input
                            placeholder="Enter your username"
                            value={loginForm.username}
                            onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                            onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                          />
                        </InputGroup>
                        <FormErrorMessage>{formErrors.username}</FormErrorMessage>
                      </FormControl>

                      <FormControl isInvalid={!!formErrors.password}>
                        <FormLabel>Password</FormLabel>
                        <InputGroup>
                          <Input
                            type={showPassword ? 'text' : 'password'}
                            placeholder="Enter your password"
                            value={loginForm.password}
                            onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                            onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                          />
                          <InputRightElement>
                            <IconButton
                              variant="ghost"
                              aria-label={showPassword ? 'Hide password' : 'Show password'}
                              icon={showPassword ? <ViewOffIcon /> : <ViewIcon />}
                              onClick={() => setShowPassword(!showPassword)}
                              size="sm"
                            />
                          </InputRightElement>
                        </InputGroup>
                        <FormErrorMessage>{formErrors.password}</FormErrorMessage>
                      </FormControl>

                      <Button
                        colorScheme="blue"
                        size="lg"
                        onClick={handleLogin}
                        isLoading={isLoggingIn}
                        loadingText="Signing in..."
                        w="full"
                        mt={6}
                      >
                        Sign In
                      </Button>
                    </VStack>
                  </TabPanel>

                  {/* Signup Panel */}
                  <TabPanel px={0} pt={6}>
                    <VStack spacing={4} align="stretch">
                      <FormControl isInvalid={!!formErrors.username}>
                        <FormLabel>Username</FormLabel>
                        <Input
                          placeholder="Choose a username"
                          value={signupForm.username}
                          onChange={(e) => setSignupForm({ ...signupForm, username: e.target.value })}
                        />
                        <FormErrorMessage>{formErrors.username}</FormErrorMessage>
                      </FormControl>

                      <FormControl isInvalid={!!formErrors.password}>
                        <FormLabel>Password</FormLabel>
                        <InputGroup>
                          <Input
                            type={showPassword ? 'text' : 'password'}
                            placeholder="Create a password"
                            value={signupForm.password}
                            onChange={(e) => setSignupForm({ ...signupForm, password: e.target.value })}
                          />
                          <InputRightElement>
                            <IconButton
                              variant="ghost"
                              aria-label={showPassword ? 'Hide password' : 'Show password'}
                              icon={showPassword ? <ViewOffIcon /> : <ViewIcon />}
                              onClick={() => setShowPassword(!showPassword)}
                              size="sm"
                            />
                          </InputRightElement>
                        </InputGroup>
                        <FormErrorMessage>{formErrors.password}</FormErrorMessage>
                      </FormControl>

                      <FormControl isInvalid={!!formErrors.confirmPassword}>
                        <FormLabel>Confirm Password</FormLabel>
                        <InputGroup>
                          <Input
                            type={showConfirmPassword ? 'text' : 'password'}
                            placeholder="Confirm your password"
                            value={signupForm.confirmPassword}
                            onChange={(e) => setSignupForm({ ...signupForm, confirmPassword: e.target.value })}
                            onKeyPress={(e) => e.key === 'Enter' && handleSignup()}
                          />
                          <InputRightElement>
                            <IconButton
                              variant="ghost"
                              aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                              icon={showConfirmPassword ? <ViewOffIcon /> : <ViewIcon />}
                              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                              size="sm"
                            />
                          </InputRightElement>
                        </InputGroup>
                        <FormErrorMessage>{formErrors.confirmPassword}</FormErrorMessage>
                      </FormControl>

                      <Button
                        colorScheme="green"
                        size="lg"
                        onClick={handleSignup}
                        isLoading={isSigningUp}
                        loadingText="Creating account..."
                        w="full"
                        mt={6}
                      >
                        Create Account
                      </Button>
                    </VStack>
                  </TabPanel>
                </TabPanels>
              </Tabs>
            </CardBody>
          </Card>

          {/* Footer */}
          <Text textAlign="center" fontSize="sm" color={useColorModeValue("gray.500", "gray.400")}>
            Your research data is stored securely and never shared.
          </Text>
        </VStack>
      </Box>
    </Container>
  );
};