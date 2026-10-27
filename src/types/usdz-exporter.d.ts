declare module 'three/examples/jsm/exporters/USDZExporter.js' {
  import type { Object3D } from 'three';

  export class USDZExporter {
    parseAsync(scene: Object3D, options?: {
      quickLookCompatible?: boolean;
      onlyVisible?: boolean;
      includeAnchoringProperties?: boolean;
    }): Promise<ArrayBuffer>;
  }
}
