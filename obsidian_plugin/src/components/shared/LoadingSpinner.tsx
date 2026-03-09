import React from 'react';
import {
  VStack,
  Spinner,
  Text,
  Box,
} from '@chakra-ui/react';

interface LoadingSpinnerProps {
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    text?: string;
    fullHeight?: boolean;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
    size = 'md',
    text,
    fullHeight = false
}) => {
    const spinnerSizes = {
        xs: '16px',
        sm: '20px',
        md: '24px',
        lg: '32px',
        xl: '48px'
    };

    const textSizes = {
        xs: 'xs',
        sm: 'sm',
        md: 'md',
        lg: 'lg',
        xl: 'xl'
    };

    return (
        <Box
            display="flex"
            alignItems="center"
            justifyContent="center"
            h={fullHeight ? '100%' : 'auto'}
            minH={fullHeight ? '200px' : 'auto'}
            py={fullHeight ? 0 : 8}
        >
            <VStack spacing={4}>
                <Spinner
                    thickness="3px"
                    speed="0.8s"
                    emptyColor="obsidian.bg.secondary"
                    color="obsidian.interactive.accent"
                    size={size}
                    w={spinnerSizes[size]}
                    h={spinnerSizes[size]}
                />
                {text && (
                    <Text 
                        color="obsidian.text.muted" 
                        fontSize={textSizes[size]}
                        textAlign="center"
                        maxW="300px"
                    >
                        {text}
                    </Text>
                )}
            </VStack>
        </Box>
    );
};