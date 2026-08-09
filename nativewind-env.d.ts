/// <reference types="nativewind/types" />

// NativeWind 4.2.6 ships no ambient declaration for CSS side-effect imports,
// and TypeScript 6 rejects them (TS2882). See docs/MILESTONE_0_REPORT.md.
declare module '*.css' {}
