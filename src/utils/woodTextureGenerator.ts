import * as THREE from 'three';
import type { WoodMaterial, WoodSpecies } from '../types/furniture';

const textureCache = new Map<string, THREE.CanvasTexture>();

export const PRESET_WOOD_MATERIALS: Record<WoodSpecies, WoodMaterial> = {
  oak: {
    id: 'oak',
    name: 'Natural Oak',
    species: 'oak',
    baseColor: '#d4a373',
    secondaryColor: '#a97142',
    grainIntensity: 0.65,
    grainScale: 4.5,
    roughness: 0.4,
    metalness: 0.05,
    varnishSheen: 'satin'
  },
  walnut: {
    id: 'walnut',
    name: 'Dark Walnut',
    species: 'walnut',
    baseColor: '#4a3525',
    secondaryColor: '#2b1b10',
    grainIntensity: 0.75,
    grainScale: 3.8,
    roughness: 0.35,
    metalness: 0.05,
    varnishSheen: 'satin'
  },
  mahogany: {
    id: 'mahogany',
    name: 'Warm Mahogany',
    species: 'mahogany',
    baseColor: '#6e2a1d',
    secondaryColor: '#3d120a',
    grainIntensity: 0.7,
    grainScale: 5.0,
    roughness: 0.3,
    metalness: 0.05,
    varnishSheen: 'glossy'
  },
  pine: {
    id: 'pine',
    name: 'Rustic Pine',
    species: 'pine',
    baseColor: '#e9c46a',
    secondaryColor: '#c7923e',
    grainIntensity: 0.8,
    grainScale: 2.8,
    roughness: 0.5,
    metalness: 0.0,
    varnishSheen: 'matte'
  },
  teak: {
    id: 'teak',
    name: 'Golden Teak',
    species: 'teak',
    baseColor: '#b07d3b',
    secondaryColor: '#784e1b',
    grainIntensity: 0.6,
    grainScale: 4.0,
    roughness: 0.35,
    metalness: 0.05,
    varnishSheen: 'satin'
  },
  cherry: {
    id: 'cherry',
    name: 'American Cherry',
    species: 'cherry',
    baseColor: '#8d402b',
    secondaryColor: '#522013',
    grainIntensity: 0.55,
    grainScale: 4.2,
    roughness: 0.3,
    metalness: 0.05,
    varnishSheen: 'satin'
  },
  ebony: {
    id: 'ebony',
    name: 'Smoked Ebony',
    species: 'ebony',
    baseColor: '#1f1917',
    secondaryColor: '#0a0807',
    grainIntensity: 0.85,
    grainScale: 6.0,
    roughness: 0.25,
    metalness: 0.1,
    varnishSheen: 'glossy'
  },
  birch: {
    id: 'birch',
    name: 'Light Birch',
    species: 'birch',
    baseColor: '#f6ebd4',
    secondaryColor: '#e4d2ae',
    grainIntensity: 0.28,
    grainScale: 3.2,
    roughness: 0.42,
    metalness: 0.0,
    varnishSheen: 'satin'
  },
  custom_paint: {
    id: 'custom_paint',
    name: 'Painted Matte Finish',
    species: 'custom_paint',
    baseColor: '#2b3a4a',
    secondaryColor: '#1e2834',
    grainIntensity: 0.15,
    grainScale: 2.0,
    roughness: 0.6,
    metalness: 0.0,
    varnishSheen: 'matte'
  },
  metal_accent: {
    id: 'metal_accent',
    name: 'Brushed Brass / Iron',
    species: 'metal_accent',
    baseColor: '#d4af37',
    secondaryColor: '#aa8c2c',
    grainIntensity: 0.2,
    grainScale: 8.0,
    roughness: 0.2,
    metalness: 0.85,
    varnishSheen: 'glossy'
  }
};

export function generateWoodTexture(mat: WoodMaterial): THREE.CanvasTexture {
  const cacheKey = JSON.stringify({
    species: mat.species,
    baseColor: mat.baseColor,
    secondaryColor: mat.secondaryColor,
    grainIntensity: mat.grainIntensity,
    grainScale: mat.grainScale,
    stainColor: mat.stainColor,
    stainOpacity: mat.stainOpacity
  });

  if (textureCache.has(cacheKey)) {
    return textureCache.get(cacheKey)!;
  }

  const width = 512;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    const fallbackKey = `fallback-${mat.species}`;
    if (!textureCache.has(fallbackKey)) {
      const tex = new THREE.CanvasTexture(canvas);
      textureCache.set(fallbackKey, tex);
    }
    return textureCache.get(fallbackKey)!;
  }

  ctx.fillStyle = mat.baseColor;
  ctx.fillRect(0, 0, width, height);

  const grainLines = Math.floor(mat.grainScale * 40);
  ctx.lineWidth = 1.2;

  for (let i = 0; i < grainLines; i++) {
    const y = (i / grainLines) * height;
    ctx.beginPath();
    ctx.strokeStyle = mat.secondaryColor;
    ctx.globalAlpha = (Math.random() * 0.4 + 0.2) * mat.grainIntensity;

    ctx.moveTo(0, y);

    for (let x = 0; x < width; x += 15) {
      const wave1 = Math.sin((x + i * 20) * 0.02) * 6;
      const wave2 = Math.cos((x * 0.05) + i) * 3;
      const noise = (Math.random() - 0.5) * 2;
      ctx.lineTo(x, y + wave1 + wave2 + noise);
    }
    ctx.stroke();
  }

  if (mat.species === 'oak' || mat.species === 'pine' || mat.species === 'walnut') {
    const numKnots = mat.species === 'pine' ? 3 : 1;
    ctx.globalAlpha = 0.3 * mat.grainIntensity;
    ctx.fillStyle = mat.secondaryColor;
    
    for (let k = 0; k < numKnots; k++) {
      const kx = (k + 1) * (width / (numKnots + 1)) + (Math.random() * 40 - 20);
      const ky = (k + 1) * (height / (numKnots + 1)) + (Math.random() * 40 - 20);
      
      for (let r = 25; r > 2; r -= 3) {
        ctx.beginPath();
        ctx.ellipse(kx, ky, r, r * 0.4, Math.PI / 6, 0, Math.PI * 2);
        ctx.strokeStyle = mat.secondaryColor;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

  if (mat.stainColor && mat.stainOpacity && mat.stainOpacity > 0) {
    ctx.globalAlpha = mat.stainOpacity;
    ctx.fillStyle = mat.stainColor;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.globalAlpha = 1.0;

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);

  textureCache.set(cacheKey, texture);
  return texture;
}

export function createWoodMeshMaterial(mat: WoodMaterial): THREE.MeshStandardMaterial {
  const woodTex = generateWoodTexture(mat);
  
  let roughness = mat.roughness;
  if (mat.varnishSheen === 'glossy') roughness = 0.15;
  if (mat.varnishSheen === 'matte') roughness = 0.7;

  return new THREE.MeshStandardMaterial({
    map: woodTex,
    color: mat.baseColor,
    roughness: roughness,
    metalness: mat.metalness,
    bumpMap: woodTex,
    bumpScale: mat.grainIntensity * 0.02
  });
}
