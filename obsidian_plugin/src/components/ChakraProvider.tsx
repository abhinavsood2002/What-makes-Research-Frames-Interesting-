import React from 'react';
import { ChakraProvider as BaseChakraProvider, ColorModeScript } from '@chakra-ui/react';
import obsidianTheme from '../theme/chakraTheme';

interface ChakraProviderProps {
  children: React.ReactNode;
}

export const ChakraProvider: React.FC<ChakraProviderProps> = ({ children }) => {
  return (
    <>
      <ColorModeScript initialColorMode={obsidianTheme.config.initialColorMode} />
      <BaseChakraProvider theme={obsidianTheme}>
        {children}
      </BaseChakraProvider>
    </>
  );
};