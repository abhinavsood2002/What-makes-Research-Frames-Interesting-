// src/theme/chakraTheme.ts
import { extendTheme, type ThemeConfig } from '@chakra-ui/react';

const config: ThemeConfig = {
  initialColorMode: 'dark',
  useSystemColorMode: false,
};

const obsidianTheme = extendTheme({
  config,
  styles: {
    global: {
      body: {
        bg: 'var(--background-primary)',
        color: 'var(--text-normal)',
        fontFamily: 'var(--font-interface)',
      },
      '*::-webkit-scrollbar': {
        width: '8px',
        height: '8px',
      },
      '*::-webkit-scrollbar-track': {
        bg: 'transparent',
      },
      '*::-webkit-scrollbar-thumb': {
        bg: 'var(--background-modifier-border)',
        borderRadius: '4px',
      },
      '*::-webkit-scrollbar-thumb:hover': {
        bg: 'var(--text-muted)',
      },
      '@keyframes fadeInUp': {
        '0%': {
          opacity: 0,
          transform: 'translateY(20px)',
        },
        '100%': {
          opacity: 1,
          transform: 'translateY(0)',
        },
      },
      '@keyframes shimmer': {
        '0%': {
          backgroundPosition: '-200px 0',
        },
        '100%': {
          backgroundPosition: 'calc(200px + 100%) 0',
        },
      },
    },
  },
  colors: {
    obsidian: {
      bg: {
        primary: 'var(--background-primary)',
        secondary: 'var(--background-secondary)',
        primaryAlt: 'var(--background-primary-alt)',
      },
      text: {
        normal: 'var(--text-normal)',
        muted: 'var(--text-muted)',
        accent: 'var(--text-accent)',
        success: 'var(--text-success)',
        onAccent: 'var(--text-on-accent)',
        faint: 'var(--text-faint)',
      },
      interactive: {
        normal: 'var(--interactive-normal)',
        hover: 'var(--interactive-hover)',
        accent: 'var(--interactive-accent)',
        accentHover: 'var(--interactive-accent-hover)',
      },
      modifier: {
        border: 'var(--background-modifier-border)',
        hover: 'var(--background-modifier-hover)',
        success: 'var(--background-modifier-success)',
        error: 'var(--background-modifier-error)',
      },
    },
  },
  components: {
    Button: {
      baseStyle: {
        fontWeight: '500',
        borderRadius: '8px',
        transition: 'all 0.2s ease',
        _focus: {
          boxShadow: '0 0 0 2px var(--interactive-accent)',
        },
      },
      variants: {
        solid: {
          bg: 'obsidian.interactive.accent',
          color: 'obsidian.text.onAccent',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
          _hover: {
            bg: 'obsidian.interactive.accentHover',
            transform: 'translateY(-1px)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
            _disabled: {
              bg: 'obsidian.interactive.accent',
              opacity: 0.5,
              transform: 'none',
              boxShadow: 'none',
            },
          },
          _active: {
            transform: 'translateY(0)',
            boxShadow: '0 1px 4px rgba(0, 0, 0, 0.2)',
          },
        },
        outline: {
          border: '1px solid',
          borderColor: 'obsidian.modifier.border',
          bg: 'transparent',
          color: 'obsidian.text.normal',
          _hover: {
            bg: 'obsidian.modifier.hover',
            borderColor: 'obsidian.interactive.accent',
            _disabled: {
              bg: 'transparent',
              opacity: 0.5,
            },
          },
        },
        ghost: {
          bg: 'transparent',
          color: 'obsidian.text.normal',
          _hover: {
            bg: 'obsidian.modifier.hover',
          },
        },
        gradient: {
          bgGradient: 'linear(to-r, obsidian.interactive.accent, obsidian.interactive.accentHover)',
          color: 'white',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
          _hover: {
            bgGradient: 'linear(to-r, obsidian.interactive.accentHover, obsidian.interactive.accent)',
            transform: 'translateY(-1px)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
          },
        },
      },
      sizes: {
        sm: {
          h: '32px',
          minW: '32px',
          fontSize: '13px',
          px: 3,
        },
        md: {
          h: '36px',
          minW: '36px',
          fontSize: '14px',
          px: 4,
        },
        lg: {
          h: '44px',
          minW: '44px',
          fontSize: '16px',
          px: 6,
        },
      },
    },
    Card: {
      baseStyle: {
        container: {
          bg: 'obsidian.bg.primary',
          borderRadius: '12px',
          overflow: 'hidden',
          transition: 'all 0.3s ease',
        },
      },
      variants: {
        outline: {
          container: {
            border: '1px solid',
            borderColor: 'obsidian.modifier.border',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
            _hover: {
              borderColor: 'obsidian.interactive.accent',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
            },
          },
        },
        filled: {
          container: {
            bg: 'obsidian.bg.secondary',
            border: '1px solid',
            borderColor: 'obsidian.bg.secondary',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
          },
        },
        elevated: {
          container: {
            bg: 'obsidian.bg.primaryAlt',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
            border: 'none',
          },
        },
        glass: {
          container: {
            bg: 'rgba(255, 255, 255, 0.02)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
          },
        },
      },
    },
    Input: {
      baseStyle: {
        field: {
          bg: 'obsidian.bg.primary',
          border: '1px solid',
          borderColor: 'obsidian.modifier.border',
          borderRadius: '8px',
          color: 'obsidian.text.normal',
          transition: 'all 0.2s ease',
          _placeholder: {
            color: 'obsidian.text.muted',
          },
          _hover: {
            borderColor: 'obsidian.text.muted',
          },
          _focus: {
            borderColor: 'obsidian.interactive.accent',
            boxShadow: '0 0 0 1px var(--interactive-accent)',
          },
        },
      },
    },
    Textarea: {
      baseStyle: {
        bg: 'obsidian.bg.primary',
        border: '1px solid',
        borderColor: 'obsidian.modifier.border',
        borderRadius: '8px',
        color: 'obsidian.text.normal',
        transition: 'all 0.2s ease',
        _placeholder: {
          color: 'obsidian.text.muted',
        },
        _hover: {
          borderColor: 'obsidian.text.muted',
        },
        _focus: {
          borderColor: 'obsidian.interactive.accent',
          boxShadow: '0 0 0 1px var(--interactive-accent)',
        },
      },
    },
    Badge: {
      baseStyle: {
        px: 2.5,
        py: 1,
        borderRadius: '6px',
        fontSize: '12px',
        fontWeight: '500',
        transition: 'all 0.2s ease',
      },
      variants: {
        subtle: {
          bg: 'obsidian.bg.secondary',
          color: 'obsidian.text.accent',
          border: '1px solid',
          borderColor: 'obsidian.modifier.border',
        },
        solid: {
          bg: 'obsidian.interactive.accent',
          color: 'obsidian.text.onAccent',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        },
        gradient: {
          bgGradient: 'linear(to-r, obsidian.interactive.accent, obsidian.interactive.accentHover)',
          color: 'white',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        },
      },
    },
    Progress: {
      baseStyle: {
        track: {
          bg: 'obsidian.bg.secondary',
          borderRadius: 'full',
          overflow: 'hidden',
        },
        filledTrack: {
          bg: 'obsidian.interactive.accent',
          bgGradient: 'linear(to-r, obsidian.interactive.accent, obsidian.interactive.accentHover)',
          transition: 'all 0.3s ease',
        },
      },
    },
    Divider: {
      baseStyle: {
        borderColor: 'obsidian.modifier.border',
        opacity: 0.6,
      },
    },
    Heading: {
      baseStyle: {
        fontWeight: '600',
        color: 'obsidian.text.normal',
      },
      sizes: {
        lg: {
          fontSize: '28px',
          lineHeight: '1.2',
        },
        md: {
          fontSize: '22px',
          lineHeight: '1.3',
        },
        sm: {
          fontSize: '18px',
          lineHeight: '1.4',
        },
      },
    },
    Tag: {
      baseStyle: {
        container: {
          borderRadius: '6px',
          px: 3,
          py: 1,
          fontSize: '13px',
          fontWeight: '500',
          transition: 'all 0.2s ease',
        },
      },
      variants: {
        subtle: {
          container: {
            bg: 'obsidian.bg.secondary',
            color: 'obsidian.text.normal',
            border: '1px solid',
            borderColor: 'obsidian.modifier.border',
            _hover: {
              borderColor: 'obsidian.interactive.accent',
              color: 'obsidian.text.accent',
            },
          },
        },
        solid: {
          container: {
            bg: 'obsidian.interactive.accent',
            color: 'obsidian.text.onAccent',
          },
        },
      },
    },
    Skeleton: {
      baseStyle: {
        bgGradient: 'linear(to-r, obsidian.bg.secondary, obsidian.modifier.hover, obsidian.bg.secondary)',
        animation: 'shimmer 2s infinite',
      },
    },
  },
  shadows: {
    sm: '0 1px 3px rgba(0, 0, 0, 0.05)',
    md: '0 4px 12px rgba(0, 0, 0, 0.1)',
    lg: '0 8px 24px rgba(0, 0, 0, 0.12)',
    xl: '0 12px 48px rgba(0, 0, 0, 0.15)',
    glow: '0 0 20px var(--interactive-accent)',
  },
  radii: {
    none: '0',
    sm: '4px',
    base: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    full: '9999px',
  },
});

export default obsidianTheme;