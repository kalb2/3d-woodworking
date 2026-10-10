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
 * The triangle sits on the far clip plane and writes that same depth, so the
 * lines fail the depth test wherever a solid part already drew.
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
      // Far side of the clip volume. This pass is transparent, so it runs
      // after solid parts. A clip z of 0 sits in front of every mesh when
      // gl_FragDepth is ignored, and the lines show through the wood.
      gl_Position = vec4(p, 0.9999998, 1.0);

      // Keep these homogeneous. Dividing here and interpolating the
      // world positions pulls the hit toward the camera.
      mat4 invViewProj = inverse(projectionMatrix * viewMatrix);
      vNear4 = invViewProj * vec4(p, -1.0, 1.0);
      vFar4 = invViewProj * vec4(p, 1.0, 1.0);
    }
  `,
  /* glsl */ `
    varying vec4 vNear4;
    varying vec4 vFar4;

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
      if (alpha < 0.015) discard;

      // Behind every real surface. Solid parts already wrote a closer depth,
      // so this fragment is rejected on wood and only survives on empty ground.
      gl_FragDepth = 0.9999999;
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
    // Draw the grid in the OPAQUE pass, before any part (renderOrder below), with
    // manual alpha blending and no depth write. Parts then paint over it
    // completely, so lines can never show through wood regardless of depth
    // precision or gl_FragDepth support on the device.
    mat.transparent = false;
    mat.blending = THREE.CustomBlending;
    mat.blendSrc = THREE.SrcAlphaFactor;
    mat.blendDst = THREE.OneMinusSrcAlphaFactor;
    mat.depthTest = false;
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
      renderOrder={-1000}
      raycast={() => {}}
    />
  );
};
