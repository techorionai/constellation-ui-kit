import { createTheme, type MantineColorsTuple } from '@mantine/core';

const constellationBlue: MantineColorsTuple = [
  '#eef3ff',
  '#dce4f5',
  '#b9c7e2',
  '#94a8d0',
  '#748dc1',
  '#5f7cb8',
  '#5474b4',
  '#44639f',
  '#39588f',
  '#2d4b81',
];

const SYSTEM_FONT_STACK =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif';
const MONO_FONT_STACK =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';

/** Mantine theme of the Constellation platform. It uses system fonts only. */
export const constellationTheme = createTheme({
  primaryColor: 'constellation',
  primaryShade: 7,
  colors: { constellation: constellationBlue },
  defaultRadius: 'md',
  focusRing: 'auto',
  fontFamily: SYSTEM_FONT_STACK,
  fontFamilyMonospace: MONO_FONT_STACK,
  headings: { fontFamily: SYSTEM_FONT_STACK },
});
