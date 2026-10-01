import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { shaderMaterial } from '@react-three/drei';

interface TransparentFloorProps {
  visible: boolean;
  opacity: number;
}

/**
 * Screen-space workshop grid. Each pixel that sees the ground draws a line
 * from the ray/plane hit, so zoom and pan never run into a finite quad.
 * Fine lines dissolve once they are only a pixel or two wide.
 */
const InfiniteWorkshopGridMaterial = shaderMaterial(
  {
    cellSize: 2,
    sectionSize: 12,
    cellColor: new THREE.Color('#334155'),
    sectionColor: new THREE.Color('#e09f3e'),
    cellThickness: 0.65,
    sectionThickness: 1.2,
    planeY: -0.02,
    fadeDistance: 12000,
    fadeStrength: 0.5,
  },
  /* glsl */ `
    varying vec3 vRayOrigin;
    varying vec3 vRayDir;

    void main() {
      vec2 p = position.xy;
      gl_Position = vec4(p, 0.0, 1.0);

      mat4 invViewProj = inverse(projectionMatrix * viewMatrix);
      vec4 near4 = invViewProj * vec4(p, -1.0, 1.0);
      vec4 far4 = invViewProj * vec4(p, 1.0, 1.0);
      vec3 nearPos = near4.xyz / near4.w;
      vec3 farPos = far4.xyz / far4.w;
      vRayOrigin = nearPos;
      vRayDir = farPos - nearPos;
    }
  `,
  /* glsl */ `
    varying vec3 vRayOrigin;
    varying vec3 vRayDir;

    uniform float cellSize;
    uniform float sectionSize;
    uniform vec3 cellColor;
    uniform vec3 sectionColor;
    uniform float cellThickness;
    uniform float sectionThickness;
    uniform float planeY;
    uniform float fadeDistance;
    uniform float fadeStrength;

    float gridLine(vec2 coord, float size, float thickness) {
      vec2 r = coord / size;
      vec2 g = abs(fract(r - 0.5) - 0.5) / fwidth(r);
      float line = min(g.x, g.y) + 1.0 - thickness;
      return 1.0 - min(line, 1.0);
    }

    void main() {
      float denom = vRayDir.y;
      if (abs(denom) < 1e-5) discard;

      float t = (planeY - vRayOrigin.y) / denom;
      if (t < 0.0) discard;

      vec3 hit = vRayOrigin + vRayDir * t;
      float minor = gridLine(hit.xz, cellSize, cellThickness);
      float major = gridLine(hit.xz, sectionSize, sectionThickness);

      float pixelWorld = max(fwidth(hit.x), fwidth(hit.z));
      float pixelsPerCell = cellSize / max(pixelWorld, 1e-4);
      float pixelsPerSection = sectionSize / max(pixelWorld, 1e-4);
      minor *= smoothstep(1.25, 3.5, pixelsPerCell);
      major *= smoothstep(1.25, 3.5, pixelsPerSection);

      float line = max(minor, major);
      float dist = distance(hit.xz, cameraPosition.xz);
      float fade = pow(clamp(1.0 - dist / fadeDistance, 0.0, 1.0), fadeStrength);
      float alpha = line * mix(0.92, 1.0, clamp(major, 0.0, 1.0)) * fade;

      vec4 clipPos = projectionMatrix * viewMatrix * vec4(hit, 1.0);
      float ndcZ = clipPos.z / clipPos.w;
      if (alpha < 0.02 || ndcZ < -1.0 || ndcZ > 1.0) discard;

      gl_FragColor = vec4(mix(cellColor, sectionColor, clamp(major, 0.0, 1.0)), alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      gl_FragDepth = ndcZ * 0.5 + 0.5;
    }
  `,
);

const GRID_TRIANGLE = new Float32Array([
  -1, -1, 0,
  3, -1, 0,
  -1, 3, 0,
]);

export const TransparentFloor: React.FC<TransparentFloorProps> = ({ visible }) => {
  const geometry = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(GRID_TRIANGLE, 3));
    return geom;
  }, []);

  const material = useMemo(() => {
    const mat = new InfiniteWorkshopGridMaterial();
    mat.transparent = true;
    mat.depthTest = true;
    mat.depthWrite = false;
    mat.toneMapped = true;
    return mat;
  }, []);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  if (!visible) return null;

  return (
    <mesh
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={-1}
      raycast={() => {}}
    />
  );
};
