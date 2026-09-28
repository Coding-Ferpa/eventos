/**
 * O worker do pdf.js não traz tipos. O servidor só o importa pelo efeito:
 * ao carregar, ele se registra em `globalThis.pdfjsWorker` (lib/fonte-enviada.ts).
 */
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs'
