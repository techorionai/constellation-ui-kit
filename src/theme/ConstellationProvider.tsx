import type { ReactNode } from 'react';
import {
  MantineProvider,
  mergeThemeOverrides,
  type CSSVariablesResolver,
  type MantineThemeOverride,
} from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { constellationTheme } from './theme';

/** Dimmed text must have a contrast of 4.5:1 or more in both color schemes. */
const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: { '--mantine-color-dimmed': 'var(--mantine-color-gray-7)' },
  dark: { '--mantine-color-dimmed': 'var(--mantine-color-dark-1)' },
});

export interface ConstellationProviderProps {
  children?: ReactNode;
  /** Theme overrides. They merge with `constellationTheme`. */
  theme?: MantineThemeOverride;
}

/** Wraps `MantineProvider` with the kit theme, the color scheme `auto`, and notifications. */
export function ConstellationProvider({ children, theme }: ConstellationProviderProps) {
  const merged = theme ? mergeThemeOverrides(constellationTheme, theme) : constellationTheme;
  return (
    <MantineProvider
      theme={merged}
      defaultColorScheme="auto"
      cssVariablesResolver={cssVariablesResolver}
    >
      <Notifications />
      {children}
    </MantineProvider>
  );
}
