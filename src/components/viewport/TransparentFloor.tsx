import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { shaderMaterial } from '@react-three/drei';

interface TransparentFloorProps {
  visible: boolean;
  opacity: number;
}

/**
 * Infinite workshop grid. Each pixel that sees the ground draws from the
 * ray/plane hit, so zoom and pan never run into a finite quad.
 *
 * Major lines are a quiet gray square; minor lines subdivide each square
 * five ways and fade out first. Both dissolve with distance, scaled to the
 * camera, so the ground stays unbounded and the horizon stays a void.
 * Depth is the real ground hit (homogeneous ray) so opaque parts occlude it.
 */
const InfiniteWorkshopGridMaterial = shaderMaterial(
  {
    cellSize: 4,
    sectionSize: 20,
    cellColor: new THREE.Color('#b7bec8'),
    sectionColor: new THREE.Color('#8e97a3'),
    cellThickness: 0.85,
    sectionThickness: 1.35,
    planeY: -0.02,
  },
  /* glsl */ `
    varying vec4 vNear4;
    varying vec4 vFar4;

    void main() {
      vec2 p = position.xy;
      gl_Position = vec4(p, 0.0, 1.0);

      // Keep these homogeneous. Dividing here and interpolating the
      // world positions pulls the hit toward the camera, so the grid
      // depth lands in front of solid parts.
      mat4 invViewProj = inverse(projectionMatrix * viewMatrix);
      vNear4 = invViewProj * vec4(p, -1.0, 1.0);
      vFar4 = invViewProj * vec4(p, 1.0, 1.0);
    }
  `,
  /* glsl */ `
    varying vec4 vNear4;
    varying vec4 vFar4;

    uniform mat4 projectionMatrix;
    uniform float cellSize;
    uniform float sectionSize;
    uniform vec3 cellColor;
    uniform vec3 sectionColor;
    uniform float cellThickness;
    uniform float sectionThickness;
    uniform float planeY;

    float gridLine(vec2 coord, float size, float thickness) {
      vec2 r = coord / size;
      vec2 g = abs(fract(r - 0.5) - 0.5) / fwidth(r);
      float line = min(g.x, g.y) + 1.0 - thickness;
      return 1.0 - min(line, 1.0);
    }

    void main() {
      // Underside views stay a clean void — no grid through the ground.
      if (cameraPosition.y < planeY) discard;

      vec3 nearPos = vNear4.xyz / vNear4.w;
      vec3 farPos = vFar4.xyz / vFar4.w;
      vec3 rayDir = farPos - nearPos;
      float denom = rayDir.y;
      if (abs(denom) < 1e-5) discard;

      float t = (planeY - nearPos.y) / denom;
      if (t < 0.0) discard;

      vec3 hit = nearPos + rayDir * t;
      float minor = gridLine(hit.xz, cellSize, cellThickness);
      float major = gridLine(hit.xz, sectionSize, sectionThickness);

      float pixelWorld = max(fwidth(hit.x), fwidth(hit.z));
      float pixelsPerCell = cellSize / max(pixelWorld, 1e-4);
      float pixelsPerSection = sectionSize / max(pixelWorld, 1e-4);
      // Minors drop out first when a cell is only a few pixels wide.
      minor *= smoothstep(2.4, 8.0, pixelsPerCell);
      major *= smoothstep(1.6, 5.0, pixelsPerSection);

      // Fade radius tracks the camera so zoom-out stays unbounded and the
      // far ground dissolves into the void instead of a hard edge.
      float height = max(cameraPosition.y - planeY, 0.5);
      float reach = length(cameraPosition.xz);
      float horizon = max(reach * 2.4, height * 5.0);
      float fadeStart = horizon * 0.32;
      float dist = distance(hit.xz, cameraPosition.xz);
      float minorFade = smoothstep(horizon * 0.62, fadeStart, dist);
      float majorFade = smoothstep(horizon, fadeStart * 0.85, dist);

      float alpha = max(minor * 0.32 * minorFade, major * 0.5 * majorFade);

      vec4 clipPos = projectionMatrix * viewMatrix * vec4(hit, 1.0);
      float ndcZ = clipPos.z / clipPos.w;
      if (alpha < 0.015 || ndcZ < -1.0 || ndcZ > 1.0) discard;

      // Window depth of the ground hit. Parts in front fail this test.
      gl_FragDepth = clamp(ndcZ * 0.5 + 0.5, 0.0, 1.0);
      gl_FragColor = vec4(mix(cellColor, sectionColor, clamp(major, 0.0, 1.0)), alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
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
    mat.side = THREE.DoubleSide;
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
