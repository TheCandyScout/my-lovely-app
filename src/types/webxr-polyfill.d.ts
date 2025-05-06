// src/types/webxr-polyfill.d.ts

declare module 'webxr-polyfill' {
  /**
   * WebXR Device API polyfill
   */
  export default class WebXRPolyfill {
    constructor(options?: {
      /**
       * Whether to inject polyfill APIs even if they're available natively
       */
      global?: boolean;
      /**
       * Whether to register the polyfilled requestDevice with Navigator
       */
      webvr?: boolean;
      /**
       * Whether to install the additional AR-specific APIs
       */
      cardboard?: boolean;
    });
  }
}