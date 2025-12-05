import { Canvas, useFrame } from '@react-three/fiber';
import { useRef, useMemo } from 'react';
import * as THREE from 'three';

interface SkyscraperProps {
  position: [number, number, number];
  baseHeight: number;
  speed: number;
  phase: number;
}

const Skyscraper = ({ position, baseHeight, speed, phase }: SkyscraperProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      const heightOffset = Math.sin(state.clock.elapsedTime * speed + phase) * 1.5;
      const currentHeight = Math.max(1, baseHeight + heightOffset);
      meshRef.current.scale.y = currentHeight;
      meshRef.current.position.y = currentHeight / 2;
    }
  });

  return (
    <mesh ref={meshRef} position={[position[0], position[1], position[2]]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial 
        color="#8b5cf6"
        roughness={0.5}
        metalness={0}
        flatShading={true}
      />
    </mesh>
  );
};

const Scene = () => {
  const skyscrapers = useMemo(() => {
    const buildings: SkyscraperProps[] = [];
    const gridSize = 12;
    
    for (let x = 0; x < gridSize; x++) {
      for (let z = 0; z < gridSize; z++) {
        // Position cubes edge-to-edge (no gaps)
        const posX = x - gridSize / 2 + 0.5;
        const posZ = z - gridSize / 2 + 0.5;
        
        // Varying base heights
        const baseHeight = 2 + Math.random() * 4;
        
        // Wave animation parameters
        const speed = 0.2 + Math.random() * 0.15;
        const phase = (x * 0.6 + z * 0.6);
        
        buildings.push({
          position: [posX, 0, posZ] as [number, number, number],
          baseHeight,
          speed,
          phase,
        });
      }
    }
    
    return buildings;
  }, []);

  return (
    <>
      {/* Strong directional light from top-right-front for clear face shading */}
      <directionalLight 
        position={[5, 10, 5]} 
        intensity={1.5} 
        color="#ffffff"
      />
      
      {/* Softer fill light from opposite side with purple tint */}
      <directionalLight 
        position={[-5, 3, -5]} 
        intensity={0.3} 
        color="#a78bfa"
      />
      
      {/* Ambient light with purple base */}
      <ambientLight intensity={0.4} color="#7c3aed" />
      
      {/* Isometric view - rotated 45 degrees, viewed from above */}
      <group rotation={[Math.PI / 6, -Math.PI / 4, 0]} position={[0, 0, 0]}>
        {skyscrapers.map((building, index) => (
          <Skyscraper key={index} {...building} />
        ))}
      </group>
    </>
  );
};

const IsometricBackground = () => {
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[#7c3aed] via-[#8b5cf6] to-[#a78bfa]" />
      <Canvas
        camera={{ 
          position: [0, 0, 15], 
          fov: 50,
          near: 0.1,
          far: 100
        }}
        style={{ background: 'transparent' }}
        gl={{ antialias: true }}
      >
        <Scene />
      </Canvas>
    </div>
  );
};

export default IsometricBackground;
